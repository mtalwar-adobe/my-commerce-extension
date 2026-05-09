/*
* <license header>
*/

jest.mock('../actions/ims-token.js', () => ({
  getImsAccessToken: jest.fn(),
}));

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn(),
  },
}));

const { Core } = require('@adobe/aio-sdk');
const { getImsAccessToken } = require('../actions/ims-token.js');
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);

const action = require('../actions/product-enrichment/index.js');

const baseParams = {
  sku: 'TEST-SKU',
  COMMERCE_API_BASE_URL: 'https://api.commerce.adobe.com',
  IMS_OAUTH_S2S_CLIENT_ID: 'fakeClientId',
  IMS_OAUTH_S2S_ORG_ID: 'fakeOrgId',
};

beforeEach(() => {
  jest.clearAllMocks();
  Core.Logger.mockReturnValue(mockLoggerInstance);
  mockLoggerInstance.info.mockReset();
  mockLoggerInstance.debug.mockReset();
  mockLoggerInstance.error.mockReset();
  getImsAccessToken.mockResolvedValue('fake-access-token');
  global.fetch = jest.fn();
});

describe('product-enrichment', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });

  test('should set logger to use LOG_LEVEL param', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sku: 'TEST-SKU', name: 'N', price: 1 }),
    });
    await action.main({ ...baseParams, LOG_LEVEL: 'fakeLevel' });
    expect(Core.Logger).toHaveBeenCalledWith(expect.any(String), { level: 'fakeLevel' });
  });

  test('missing sku should return 400', async () => {
    const response = await action.main({ ...baseParams, sku: undefined });
    expect(response).toEqual({
      statusCode: 400,
      body: { error: 'Missing required parameter: sku' },
    });
  });

  test('missing COMMERCE_API_BASE_URL should return 400', async () => {
    const response = await action.main({ sku: 'X' });
    expect(response).toEqual({
      statusCode: 400,
      body: { error: 'Missing COMMERCE_API_BASE_URL' },
    });
  });

  test('should return 200 with enriched product when Commerce API succeeds', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sku: 'TEST-SKU',
        name: 'Test Product',
        price: 9.99,
      }),
    });

    const response = await action.main(baseParams);

    expect(getImsAccessToken).toHaveBeenCalledWith(baseParams);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.commerce.adobe.com/V1/products/TEST-SKU',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fake-access-token',
          'x-api-key': 'fakeClientId',
          'x-gw-ims-org-id': 'fakeOrgId',
        }),
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        sku: 'TEST-SKU',
        name: 'Test Product',
        price: 9.99,
        estimatedDelivery: '3-5 business days',
      }),
    );
    expect(response.body.sustainabilityScore).toBeGreaterThanOrEqual(60);
    expect(response.body.sustainabilityScore).toBeLessThanOrEqual(99);
    expect(typeof response.body.enrichedAt).toBe('string');
  });

  test('should return Commerce API status when response is not ok', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const response = await action.main(baseParams);

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain('Commerce API error');
    expect(response.body.hint).toBeDefined();
  });

  test('should return 500 and log when getImsAccessToken fails', async () => {
    getImsAccessToken.mockRejectedValue(new Error('ims down'));

    const response = await action.main(baseParams);

    expect(response).toEqual({
      statusCode: 500,
      body: { error: 'Internal server error', detail: 'ims down' },
    });
    expect(mockLoggerInstance.error).toHaveBeenCalledWith('Action failed:', 'ims down');
  });
});
