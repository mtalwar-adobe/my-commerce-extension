import React, { useEffect, useMemo, useState } from 'react';
import { attach } from '@adobe/uix-guest';
import { extensionId } from './Constants';
import {
  Provider,
  defaultTheme,
  View,
  Heading,
  Text,
  Flex,
  ProgressCircle,
  Well,
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  TextField,
  ActionButton,
  Checkbox,
  Divider,
} from '@adobe/react-spectrum';
import appConfigImport from '../config.json';

const PAGE_SIZE_OPTIONS = ['5', '10', '25', '50'];

const TIER_OPTIONS = [
  { id: 'all', label: 'All tiers' },
  { id: 'bronze', label: 'Bronze' },
  { id: 'silver', label: 'Silver' },
  { id: 'gold', label: 'Gold' },
  { id: 'platinum', label: 'Platinum' },
];

const selectStyle = {
  minWidth: 140,
  padding: '6px 8px',
  fontSize: 14,
  borderRadius: 4,
  border: '1px solid #cacaca',
};

function orderNumberValue (order) {
  return String(order.incrementId || order.orderId || '');
}

function sortOrders (orders, sortDescriptor) {
  if (!sortDescriptor?.column) {
    return orders;
  }
  const { column, direction } = sortDescriptor;
  const dir = direction === 'descending' ? -1 : 1;
  return [...orders].sort((a, b) => {
    if (column === 'incrementId') {
      const aVal = orderNumberValue(a);
      const bVal = orderNumberValue(b);
      return (
        aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' }) *
        dir
      );
    }
    if (column === 'status') {
      const aVal = String(a.status || '');
      const bVal = String(b.status || '');
      return aVal.localeCompare(bVal, undefined, { sensitivity: 'base' }) * dir;
    }
    return 0;
  });
}

function filterOrders (orders, { searchQuery, statusFilter, tierFilter, highValueOnly }) {
  const q = searchQuery.trim().toLowerCase();
  return orders.filter((order) => {
    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }
    const tier = order.enrichment?.orderTier;
    if (tierFilter !== 'all' && tier !== tierFilter) {
      return false;
    }
    if (highValueOnly && !order.enrichment?.isHighValue) {
      return false;
    }
    if (q) {
      const id = String(order.incrementId || order.orderId || '').toLowerCase();
      if (!id.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

/** Parcel/babel may nest `default` several times around the JSON module export. */
function resolveAppConfig (raw) {
  let cfg = raw;
  while (
    cfg &&
    typeof cfg === 'object' &&
    cfg.default &&
    typeof cfg.default === 'object' &&
    !cfg.registration &&
    !cfg['admin-ui-sdk/registration'] &&
    !cfg['get-enriched-orders'] &&
    !cfg['admin-ui-sdk/get-enriched-orders']
  ) {
    cfg = cfg.default;
  }
  if (!cfg || typeof cfg !== 'object') {
    return {};
  }
  return cfg;
}

/** Injected at build/deploy into config.json (see aio app deploy / get-url). */
function getEnrichedOrdersUrl (cfg) {
  const direct =
    cfg.getEnrichedOrders ||
    cfg['admin-ui-sdk/get-enriched-orders'] ||
    cfg['get-enriched-orders'];
  if (direct) {
    return direct;
  }
  const registration =
    cfg['admin-ui-sdk/registration'] || cfg.registration;
  if (registration && typeof registration === 'string') {
    return registration.replace(/\/registration\/?$/, '/get-enriched-orders');
  }
  return null;
}

export function MainPage () {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [highValueOnly, setHighValueOnly] = useState(false);
  const [pageSize, setPageSize] = useState('10');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState('incrementId');
  const [sortDirection, setSortDirection] = useState('descending');

  const sortDescriptor = useMemo(
    () => ({ column: sortColumn, direction: sortDirection }),
    [sortColumn, sortDirection],
  );

  const statusOptions = useMemo(() => {
    const statuses = [...new Set(orders.map((o) => o.status).filter(Boolean))];
    statuses.sort();
    return [
      { id: 'all', label: 'All statuses' },
      ...statuses.map((s) => ({ id: s, label: s })),
    ];
  }, [orders]);

  const filteredOrders = useMemo(
    () =>
      filterOrders(orders, {
        searchQuery,
        statusFilter,
        tierFilter,
        highValueOnly,
      }),
    [orders, searchQuery, statusFilter, tierFilter, highValueOnly],
  );

  const sortedOrders = useMemo(
    () => sortOrders(filteredOrders, sortDescriptor),
    [filteredOrders, sortDescriptor],
  );

  const pageSizeNum = parseInt(pageSize, 10) || 10;
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSizeNum));

  const pageOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSizeNum;
    return sortedOrders.slice(start, start + pageSizeNum);
  }, [sortedOrders, currentPage, pageSizeNum]);

  const rangeStart =
    sortedOrders.length === 0 ? 0 : (currentPage - 1) * pageSizeNum + 1;
  const rangeEnd = Math.min(currentPage * pageSizeNum, sortedOrders.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, tierFilter, highValueOnly, pageSize, sortColumn, sortDirection]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    tierFilter !== 'all' ||
    highValueOnly;

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTierFilter('all');
    setHighValueOnly(false);
    setCurrentPage(1);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const guestConnection = await attach({ id: extensionId });
        const context = guestConnection.sharedContext;
        const imsToken = context.get('imsToken');
        const appConfig = resolveAppConfig(appConfigImport);
        const actionUrl = getEnrichedOrdersUrl(appConfig);
        if (!actionUrl || typeof actionUrl !== 'string') {
          throw new Error(
            'No action URL for get-enriched-orders in config.json. Redeploy the app so the Admin UI extension build picks up admin-ui-sdk/get-enriched-orders.',
          );
        }
        const response = await fetch(actionUrl, {
          headers: {
            Authorization: `Bearer ${imsToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        const raw = await response.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error(
            'Response was not JSON (often HTML from a wrong URL or auth redirect). Check that config.json points to the Runtime web action for get-enriched-orders.',
          );
        }
        const payload = data.body && typeof data.body === 'object' ? data.body : data;
        setOrders(payload.orders || []);
        setSummary(payload.summary || null);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Provider theme={defaultTheme} colorScheme="light">
        <View padding="size-400">
          <Flex alignItems="center" gap="size-200">
            <ProgressCircle aria-label="Loading" isIndeterminate />
            <Text>Loading dashboard data...</Text>
          </Flex>
        </View>
      </Provider>
    );
  }

  if (error) {
    return (
      <Provider theme={defaultTheme} colorScheme="light">
        <View padding="size-400">
          <Heading level={1}>Enriched Orders Dashboard</Heading>
          <Well>
            <Text>Error loading data: {error}</Text>
          </Well>
        </View>
      </Provider>
    );
  }

  return (
    <Provider theme={defaultTheme} colorScheme="light">
      <View padding="size-400">
        <Heading level={1}>Enriched Orders Dashboard</Heading>
        {summary && (
          <Flex gap="size-300" wrap marginBottom="size-400">
            <Well minWidth="size-2400">
              <Heading level={3}>Total Orders</Heading>
              <Text UNSAFE_style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {summary.totalOrders}
              </Text>
            </Well>
            <Well minWidth="size-2400">
              <Heading level={3}>Total Revenue</Heading>
              <Text UNSAFE_style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                ${summary.totalRevenue.toFixed(2)}
              </Text>
            </Well>
            <Well minWidth="size-2400">
              <Heading level={3}>High Value Orders</Heading>
              <Text UNSAFE_style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                {summary.highValueCount}
              </Text>
            </Well>
          </Flex>
        )}
        <Heading level={2} marginTop="size-200" marginBottom="size-200">
          Processed Orders
        </Heading>

        <Well marginBottom="size-300">
          <Heading level={3} marginBottom="size-200">
            Filter, sort &amp; pagination
          </Heading>
          <Flex direction="column" gap="size-200">
            <Flex direction="row" wrap gap="size-200" alignItems="end">
              <TextField
                label="Search order #"
                width="size-3000"
                value={searchQuery}
                onChange={setSearchQuery}
                isDisabled={orders.length === 0}
              />
              <View>
                <Text UNSAFE_style={{ fontSize: 12, marginBottom: 4 }}>
                  Status
                </Text>
                <select
                  aria-label="Filter by status"
                  style={selectStyle}
                  value={statusFilter}
                  disabled={orders.length === 0}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </View>
              <View>
                <Text UNSAFE_style={{ fontSize: 12, marginBottom: 4 }}>
                  Tier
                </Text>
                <select
                  aria-label="Filter by tier"
                  style={selectStyle}
                  value={tierFilter}
                  disabled={orders.length === 0}
                  onChange={(e) => setTierFilter(e.target.value)}
                >
                  {TIER_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </View>
              <View>
                <Text UNSAFE_style={{ fontSize: 12, marginBottom: 4 }}>
                  Per page
                </Text>
                <select
                  aria-label="Orders per page"
                  style={selectStyle}
                  value={pageSize}
                  disabled={orders.length === 0}
                  onChange={(e) => setPageSize(e.target.value)}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </View>
              <Checkbox
                isSelected={highValueOnly}
                onChange={setHighValueOnly}
                isDisabled={orders.length === 0}
              >
                High value only
              </Checkbox>
              {hasActiveFilters && (
                <ActionButton onPress={clearFilters} variant="secondary">
                  Clear filters
                </ActionButton>
              )}
            </Flex>
            <Flex direction="row" wrap gap="size-200" alignItems="end">
              <View>
                <Text UNSAFE_style={{ fontSize: 12, marginBottom: 4 }}>
                  Sort by
                </Text>
                <select
                  aria-label="Sort by column"
                  style={selectStyle}
                  value={sortColumn}
                  disabled={orders.length === 0}
                  onChange={(e) => setSortColumn(e.target.value)}
                >
                  <option value="incrementId">Order #</option>
                  <option value="status">Status</option>
                </select>
              </View>
              <View>
                <Text UNSAFE_style={{ fontSize: 12, marginBottom: 4 }}>
                  Direction
                </Text>
                <select
                  aria-label="Sort direction"
                  style={selectStyle}
                  value={sortDirection}
                  disabled={orders.length === 0}
                  onChange={(e) => setSortDirection(e.target.value)}
                >
                  <option value="ascending">Ascending</option>
                  <option value="descending">Descending</option>
                </select>
              </View>
              <ActionButton
                isDisabled={orders.length === 0}
                variant="secondary"
                onPress={() => {
                  setSortColumn('incrementId');
                  setSortDirection('descending');
                }}
              >
                Reset sort
              </ActionButton>
            </Flex>
            <Divider size="S" />
            <Flex
              alignItems="center"
              justifyContent="space-between"
              wrap
              gap="size-200"
            >
              <Text>
                {orders.length === 0
                  ? 'No orders loaded yet.'
                  : sortedOrders.length === 0
                    ? 'No orders match the current filters.'
                    : `Showing ${rangeStart}–${rangeEnd} of ${sortedOrders.length} orders${
                      sortedOrders.length !== orders.length
                        ? ` (filtered from ${orders.length})`
                        : ''
                    }`}
              </Text>
              <Flex alignItems="center" gap="size-150">
                <ActionButton
                  isDisabled={
                    orders.length === 0 || currentPage <= 1
                  }
                  onPress={() =>
                    setCurrentPage((p) => Math.max(1, p - 1))
                  }
                >
                  Previous
                </ActionButton>
                <Text>
                  Page {orders.length === 0 ? 0 : currentPage} of{' '}
                  {orders.length === 0 ? 0 : totalPages}
                </Text>
                <ActionButton
                  isDisabled={
                    orders.length === 0 || currentPage >= totalPages
                  }
                  onPress={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  Next
                </ActionButton>
              </Flex>
            </Flex>
          </Flex>
        </Well>

        {orders.length === 0 ? (
          <Well>
            <Text>
              No enriched orders yet. Create orders in Commerce to generate
              event data.
            </Text>
          </Well>
        ) : sortedOrders.length === 0 ? (
          <Well>
            <Text>Try adjusting search or filter options.</Text>
          </Well>
        ) : (
          <TableView aria-label="Enriched orders" selectionMode="none">
            <TableHeader>
              <Column key="incrementId">Order #</Column>
              <Column key="status">Status</Column>
              <Column key="grandTotal">Total</Column>
              <Column key="tier">Tier</Column>
              <Column key="items">Items</Column>
              <Column key="processedAt">Processed</Column>
            </TableHeader>
            <TableBody>
              {pageOrders.map((order) => (
                <Row key={order.orderId || order.incrementId}>
                  <Cell>{order.incrementId || order.orderId}</Cell>
                  <Cell>{order.status}</Cell>
                  <Cell>
                    {order.currency}{' '}
                    {parseFloat(order.grandTotal).toFixed(2)}
                  </Cell>
                  <Cell>{order.enrichment?.orderTier || '—'}</Cell>
                  <Cell>{order.enrichment?.itemSummary?.length || 0}</Cell>
                  <Cell>
                    {order.processedAt
                      ? new Date(order.processedAt).toLocaleString()
                      : '—'}
                  </Cell>
                </Row>
              ))}
            </TableBody>
          </TableView>
        )}
      </View>
    </Provider>
  );
}
