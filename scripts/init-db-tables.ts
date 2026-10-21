import {
  initQuotesTable, initInventoryTables, initProjectsTables, initPermissionsTables,
  initAuthTables, initClientsTable, initPaymentsTable, initFollowupsTable,
} from '../src/lib/db'

// Creates (or migrates) every table the app uses. Idempotent.
export async function ensureTables() {
  await initInventoryTables()
  await initAuthTables()
  await initQuotesTable()
  await initProjectsTables()
  await initPermissionsTables()
  await initClientsTable()
  await initPaymentsTable()
  await initFollowupsTable()
}
