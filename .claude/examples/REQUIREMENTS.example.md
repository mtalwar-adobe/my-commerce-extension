# Extension Requirements: Order Sync to ERP

<!-- 
  This document follows the REQUIREMENTS.md schema.
  Schema: references/requirements.schema.json
  All sections map to schema properties for consistent parsing by AI agents.
-->

## Document Control

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Status** | approved |
| **Last Updated** | 2025-01-15 |
| **Product Manager** | Jane Smith |
| **Stakeholders** | John Doe (CTO), Alice Johnson (Operations), Bob Williams (Finance) |
| **Approval Date** | 2025-01-14 |

---

## Executive Summary

### Business Objective

Automatically synchronize completed orders from Adobe Commerce to NetSuite ERP, eliminating manual data entry and reducing order processing time from 15 minutes to under 30 seconds per order.

### Problem Statement

Operations team manually enters 200+ orders daily into NetSuite, causing delays, data entry errors (3% error rate), and overtime costs. This bottleneck prevents scaling during peak seasons.

### Proposed Solution

Build an App Builder extension that automatically captures order completion events and pushes order data to NetSuite in real-time with automatic retry on failures.

### Expected Business Impact

| Metric | Expected Improvement |
|--------|---------------------|
| Order processing time | From 15 min to <30 sec (97% reduction) |
| Data entry errors | From 3% to 0.1% (96% reduction) |
| Monthly labor hours | Save 50+ hours/month |

### Priority

**Level**: High

**Justification**: Critical for Q2 scaling initiative. Current manual process cannot handle projected 3x order volume increase.

### Success Criteria

1. 99% of orders sync within 30 seconds of completion
2. Zero manual intervention required for successful syncs
3. Automatic retry handles 95% of transient failures

### Key Performance Indicators (KPIs)

| Metric | Current State | Target | Measurement Method |
|--------|--------------|--------|-------------------|
| Sync Success Rate | N/A | 99.5% | Success count / Total orders |
| Average Sync Time | 15 min (manual) | <30 sec | Timestamp difference |
| Error Rate | 3% | <0.1% | Failed syncs / Total syncs |

---

## Technical Context

### Target Environment

| Aspect | Value |
|--------|-------|
| **Platform** | Adobe Commerce SaaS |
| **Version** | 2.4.7 |
| **Application Type** | Headless |

### Constraints

- Must use existing NetSuite REST API (no custom endpoints)
- Extension must be deployed to Adobe I/O Runtime
- No storage of complete credit card data (PCI compliance)

### Compliance Requirements

- [x] PCI-DSS compliance required
- [x] GDPR compliance required
- [ ] HIPAA compliance required
- [ ] SOC 2 compliance required

---

## Integration Requirements

### External System 1: NetSuite ERP

**Purpose**: Central order management and fulfillment system

#### System Details

| Aspect | Value |
|--------|-------|
| **Type** | ERP |
| **Vendor** | Oracle NetSuite |
| **API Type** | REST |
| **Authentication** | OAuth 2.0 |
| **Documentation** | https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1544618879.html |

#### API Details

| Aspect | Value |
|--------|-------|
| **Base URL** | https://api.netsuite.com/services/rest/record/v1 |
| **Rate Limits** | 10 requests/second |
| **Timeout** | 30 seconds |

#### Environments

| Environment | URL |
|-------------|-----|
| Sandbox | https://sandbox.netsuite.com/services/rest/record/v1 |
| Production | https://api.netsuite.com/services/rest/record/v1 |

#### Data Flow

**TO NetSuite** (Commerce → External):

- **Trigger**: `com.adobe.commerce.observer.sales_order_save_commit_after`
- **Data**: order_id, customer, items, totals, shipping, payment_method
- **Frequency**: Real-time

**FROM NetSuite** (External → Commerce):

- **Trigger**: NetSuite webhook on fulfillment
- **Data**: tracking_number, carrier, ship_date
- **Frequency**: Real-time

#### Sample Payloads

**Outbound (Commerce → NetSuite)**:

```json
{
  "orderNumber": "000001234",
  "orderDate": "2025-01-15T10:30:00Z",
  "customer": {
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "lineItems": [
    { "sku": "WIDGET-001", "quantity": 2, "unitPrice": 29.99 }
  ],
  "grandTotal": 67.97
}
```

**Inbound (NetSuite → Commerce)**:

```json
{
  "orderNumber": "000001234",
  "status": "shipped",
  "trackingNumber": "1Z999AA1234567890",
  "carrier": "UPS"
}
```

---

## Functional Requirements

### FR-1: Order Sync on Completion

**Description**: When an order is completed in Commerce, automatically send order data to NetSuite for fulfillment processing.

**User Story**: As an operations manager, I want orders to automatically sync to NetSuite so that my team can focus on fulfillment instead of data entry.

**Priority**: Must-Have

#### Triggering Event

| Aspect | Value |
|--------|-------|
| **Type** | Commerce Event |
| **Event Name** | `com.adobe.commerce.observer.sales_order_save_commit_after` |
| **Conditions** | order.status === 'complete', order.payment_status === 'paid' |
| **Frequency** | Real-time |

#### Required Commerce Data

Based on EVENTS_SCHEMA.json:

| Field | Type | Description |
|-------|------|-------------|
| `increment_id` | string | Order number |
| `grand_total` | float | Order total |
| `customer_email` | string | Customer email |
| `items` | array | Order line items |
| `shipping_address` | object | Shipping destination |

#### Business Logic

1. Receive order completion event from Commerce
2. Validate all required fields are present
3. Transform Commerce order format to NetSuite format
4. Send order to NetSuite REST API
5. Store sync status in App Builder State
6. Return success/failure response

#### Acceptance Criteria

- [ ] **Given** a completed order with valid payment, **when** the order event is received, **then** order is sent to NetSuite within 30 seconds
- [ ] **Given** a completed order missing required fields, **when** the order event is received, **then** error is logged and admin is notified
- [ ] **Given** NetSuite API is unavailable, **when** the order event is received, **then** order is queued for retry with exponential backoff

#### Validation Rules

- Order total must be greater than 0
- Customer email must be valid format
- At least one line item required
- Shipping address must include country code

#### Error Handling

| Error Scenario | Expected Behavior |
|----------------|-------------------|
| NetSuite returns 500 error | Retry 3 times with exponential backoff, then alert admin |
| Invalid customer email format | Log error, skip sync, notify admin |
| Duplicate order ID detected | Skip sync, log as duplicate, no alert |

---

### FR-2: Shipment Update from NetSuite

**Description**: When an order is shipped in NetSuite, receive webhook and update Commerce order with tracking information.

**User Story**: As a customer, I want to receive tracking information so that I can track my package delivery.

**Priority**: Must-Have

#### Triggering Event

| Aspect | Value |
|--------|-------|
| **Type** | Backoffice Event |
| **Event Name** | netsuite-shipment-webhook |
| **Conditions** | payload.status === 'shipped' |
| **Frequency** | Real-time |

#### Required Data

| Field | Type | Description |
|-------|------|-------------|
| `orderNumber` | string | Original Commerce order number |
| `trackingNumber` | string | Carrier tracking number |
| `carrier` | string | Shipping carrier name |

#### Business Logic

1. Receive shipment webhook from NetSuite
2. Validate webhook signature
3. Find matching Commerce order
4. Update order with tracking information via Admin API
5. Trigger shipment notification email to customer

#### Acceptance Criteria

- [ ] **Given** a valid shipment webhook from NetSuite, **when** the webhook is received, **then** Commerce order is updated with tracking within 5 seconds
- [ ] **Given** a webhook with invalid signature, **when** the webhook is received, **then** request is rejected with 401 status
- [ ] **Given** order not found in Commerce, **when** the webhook is received, **then** error is logged, webhook returns 404

#### Error Handling

| Error Scenario | Expected Behavior |
|----------------|-------------------|
| Order not found | Return 404, log error for manual review |
| Commerce API unavailable | Return 503, NetSuite will retry |

---

## Business Rules

### BR-1: Order Eligibility

**Rule**: Only orders with status 'complete' and payment status 'paid' are eligible for sync

**Rationale**: Prevents syncing unpaid or cancelled orders to NetSuite

**Examples**:

| Condition | Action |
|-----------|--------|
| Order status = complete, payment = paid | Sync to NetSuite |
| Order status = pending, payment = paid | Do not sync, wait for completion |
| Order status = complete, payment = pending | Do not sync, wait for payment |

**Exceptions**: Manual override by admin can force sync for testing purposes

---

### BR-2: Duplicate Prevention

**Rule**: Each order can only be synced to NetSuite once

**Rationale**: Prevents duplicate orders in NetSuite which would cause fulfillment errors

**Examples**:

| Condition | Action |
|-----------|--------|
| Order #12345 already synced (found in State) | Skip sync, log as duplicate |
| Order #12345 sync failed previously | Allow retry sync |

---

## Data Requirements

### Data Mapping: Commerce → NetSuite

| Commerce Field | Type | NetSuite Field | Type | Transformation |
|----------------|------|----------------|------|----------------|
| increment_id | string | tranId | string | Direct mapping |
| grand_total | float | total | decimal | Round to 2 decimals |
| customer_email | string | email | string | Lowercase |
| customer_firstname + customer_lastname | string | entityName | string | Concatenate with space |

### Data Mapping: NetSuite → Commerce

| NetSuite Field | Type | Commerce Field | Type | Transformation |
|----------------|------|----------------|------|----------------|
| tranId | string | increment_id | string | Direct mapping |
| trackingNumber | string | shipment.tracking_number | string | Direct mapping |

### Data Validation Rules

**Required Fields**:

| Field | Validation Rule |
|-------|-----------------|
| increment_id | Must be non-empty string |
| grand_total | Must be positive number |
| customer_email | Must match RFC 5322 email format |

**Optional Fields**:

| Field | Default Value |
|-------|---------------|
| customer_phone | null |
| order_notes | empty string |

**Format Requirements**:

| Type | Format |
|------|--------|
| Email | RFC 5322 format |
| Phone | E.164 format |
| Currency | ISO 4217 code (USD, EUR, etc.) |
| Date/Time | ISO 8601 format |

### Data Privacy

- **PII Fields**: customer_email, customer_firstname, customer_lastname, shipping_address, billing_address, customer_phone
- **Data Retention**: Sync status retained for 90 days, then archived
- **Data Residency**: Data processed in US-WEST region only

---

## Non-Functional Requirements

### Performance Requirements

| Metric | Requirement |
|--------|-------------|
| Response Time | 95% of syncs complete within 30 seconds |
| Throughput | Handle 50 orders/minute during peak |
| Data Volume | Average order payload: 5KB, max: 50KB |
| Concurrent Users | 10 |

### Availability Requirements

| Metric | Requirement |
|--------|-------------|
| Uptime Target | 99.5% |
| Maintenance Window | Sundays 2-4 AM PST |
| Recovery Time Objective (RTO) | 4 hours |
| Recovery Point Objective (RPO) | 1 hour |

### Security Requirements

- [x] Event signature validation required
- [x] Timestamp validation (replay attack prevention)
- [x] Encryption in transit (HTTPS/TLS)
- [x] Encryption at rest (if storing sensitive data)
- [x] Audit logging for all operations
- [x] Rate limiting to prevent abuse

### Scalability Requirements

| Metric | Requirement |
|--------|-------------|
| Expected Growth | 3x volume increase over 12 months |
| Peak Load Scenarios | Black Friday (10x normal), Flash sales (5x normal) |
| Auto-scaling | Required |

---

## State Management Requirements

### Data to Persist

| Data | Purpose | Storage | TTL | Size |
|------|---------|---------|-----|------|
| Sync status per order | Track processed orders, prevent duplicates | State | 90 days | <1KB per order |
| Failed sync queue | Store orders for retry | State | 7 days | <5KB per order |

### Idempotency Strategy

Use order increment_id as idempotency key in State library

### Duplicate Detection

- Check State for existing sync record by order ID
- Use Commerce _isNew flag to identify new orders vs updates

---

## Scheduled Operations

### Schedule 1: Retry Failed Syncs

**Purpose**: Process orders that failed initial sync

**Schedule**: `*/15 * * * *` (Every 15 minutes)

**Timezone**: UTC

**Operations**:

1. Query State for failed syncs older than 5 minutes
2. Retry each failed order (max 3 retries)
3. Update State with new status
4. Alert admin if order exceeds max retries

**Timeout**: 5 minutes

**Failure Handling**: Log error, continue with remaining orders

---

### Schedule 2: Daily Reconciliation Report

**Purpose**: Generate sync status summary for operations team

**Schedule**: `0 6 * * *` (Daily at 6 AM UTC)

**Timezone**: UTC

**Operations**:

1. Query State for all syncs in past 24 hours
2. Calculate success/failure rates
3. Generate summary report
4. Email report to operations team

**Timeout**: 10 minutes

**Failure Handling**: Alert admin, do not block next day's report

---

## Error Handling & Edge Cases

### Error Handling Strategy

| Scenario | Detection | Action | Retry Policy | Alerting |
|----------|-----------|--------|--------------|----------|
| NetSuite API returns 500 | HTTP 500-599 | Queue for retry | 3x exponential, 5s initial | Alert after 3 failures |
| Invalid data format | Validation failure | Log and reject | No retry | Immediate notification |
| Rate limit exceeded | HTTP 429 | Wait and retry | 5x exponential, 60s initial | Alert if >5/hour |

### Edge Cases

| Scenario | Description | Likelihood | Impact | Handling |
|----------|-------------|------------|--------|----------|
| Order updated during sync | Customer/admin modifies order during sync | Low | Medium | Use order version to detect conflicts |
| Extremely large order | B2B bulk order with 1000+ items | Low | Medium | Chunk into multiple API calls |

### Conflict Resolution

| Scenario | Strategy | Implementation |
|----------|----------|----------------|
| Order modified in both systems | Source priority | Commerce is master for order data, NetSuite for fulfillment |

---

## User Experience Requirements

### Admin Interface

**Required**: Yes

**Features**:

- [ ] View sync status dashboard
- [ ] Manual sync trigger for specific orders
- [ ] View sync history and logs
- [ ] Retry failed syncs button
- [ ] Configuration settings (API credentials, feature flags)

**Permissions**:

| Feature | Admin | Operations |
|---------|-------|------------|
| View status | ✓ | ✓ |
| Manual sync | ✓ | ✗ |
| Configuration | ✓ | ✗ |

### Notifications

| Event | Channel | Recipients | Frequency |
|-------|---------|-----------|-----------|
| Sync failure (after retries) | Email | ops-team@company.com | Immediate |
| Daily sync summary | Email | operations@company.com | Daily |

### Debugging & Observability

**Required Logging**:

- All API requests/responses
- Validation errors
- Retry attempts
- State operations

**Debug Mode**: Enabled

**Metrics to Track**:

- Sync latency
- Success rate
- Retry rate
- Queue depth

---

## Testing Requirements

### Test Coverage Requirements

- [x] Unit tests (minimum 80% coverage)
- [x] Integration tests (all external API calls)
- [x] End-to-end tests (complete flow)
- [x] Performance tests (response time, throughput)
- [x] Security tests (signature validation, input validation)
- [x] User acceptance tests (business validation)

### Test Scenarios

**Happy Path**:

1. Complete order → Successfully synced to NetSuite
2. Shipment webhook → Order updated with tracking

**Error Path**:

1. NetSuite API down → Order queued for retry → Eventually succeeds
2. Invalid order data → Rejected with clear error message

**Edge Cases**:

1. Duplicate event received → Second one skipped
2. Very large order → Handled within timeout

### Test Data Requirements

- [x] Test Commerce environment available
- [x] Test external system account/sandbox
- [x] Sample valid payloads
- [x] Sample invalid payloads
- [x] Large payload samples (performance testing)

---

## Dependencies

### Prerequisites

| Item | Status | Owner |
|------|--------|-------|
| Adobe Developer Console project created | ✅ Completed | DevOps |
| NetSuite API credentials provided | ✅ Completed | IT |
| NetSuite sandbox access | ✅ Completed | IT |
| Commerce staging environment | ✅ Completed | DevOps |

### External Dependencies

- NetSuite REST API v1
- Adobe Commerce Admin API
- Adobe I/O Runtime

### Assumptions

1. NetSuite API will remain stable during development
2. Order volume will not exceed 1000/hour during initial launch
3. All required Commerce events are available via eventing framework

---

## Risks & Mitigation

| ID | Risk | Likelihood | Impact | Mitigation Strategy | Owner |
|----|------|-----------|--------|---------------------|-------|
| RISK-1 | NetSuite API changes or deprecation | Low | High | Version lock API calls, subscribe to changelog | Tech Lead |
| RISK-2 | Peak volume exceeds capacity | Medium | High | Load test before Black Friday, queue-based processing | DevOps |

---

## Timeline & Milestones

### Project Timeline

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Target Start | 2025-02-01 | - |
| Target Completion | 2025-03-15 | - |
| Production Deployment | 2025-03-20 | - |

### Key Milestones

1. **2025-01-15**: Requirements approved ✅
2. **2025-02-05**: Architecture complete
3. **2025-03-01**: Development complete
4. **2025-03-15**: Testing complete
5. **2025-03-20**: Production deployment

### Critical Path

Requirements → Architecture → Core sync development → Integration testing → Production

---

## Acceptance Criteria (Master Checklist)

### Functional Acceptance

- [ ] All functional requirements (FR-1, FR-2) implemented and tested
- [ ] All business rules (BR-1, BR-2) enforced
- [ ] All data mappings accurate and tested

### Technical Acceptance

- [ ] Code coverage >= 80%
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit passed

### Documentation Acceptance

- [ ] Technical documentation complete
- [ ] Deployment guide complete
- [ ] Runbook for operations complete

### Operational Acceptance

- [ ] Monitoring and alerting configured
- [ ] Logging implemented
- [ ] Rollback procedure documented

---

## Approval Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Manager | Jane Smith | 2025-01-14 | ✓ |
| Technical Lead | Mike Chen | 2025-01-14 | ✓ |
| Operations Manager | Alice Johnson | 2025-01-15 | ✓ |

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-15 | Jane Smith | Initial requirements document |

---

## Appendices

### Appendix A: Glossary

| Term | Definition |
|------|------------|
| **PaaS** | Platform as a Service - Adobe Commerce Cloud Infrastructure where customers manage Commerce application |
| **SaaS** | Software as a Service - Adobe Commerce Cloud Service, fully managed by Adobe |
| **ERP** | Enterprise Resource Planning - Business management software like NetSuite |
| **Idempotency** | Property ensuring an operation produces the same result regardless of how many times it's executed |

### Appendix B: API Documentation Links

- [NetSuite REST API Docs](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1544618879.html)
- [Adobe Commerce Events](https://developer.adobe.com/commerce/extensibility/events/)

### Appendix C: Sample Payloads

See Integration Requirements section for complete sample payloads.
