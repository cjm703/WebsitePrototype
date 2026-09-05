import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260904000000_unified_credits.sql");
const edge = read("supabase/functions/make-server-8a5950b5/index.ts");
const creditsApi = read("src/lib/credits-api.ts");
const accountPage = read("src/app/components/credit-account-page.tsx");
const commerce = read("src/app/components/commerce-page.tsx");
const personalFiles = read("src/app/components/personal-files.tsx");
const nexusNomad = read("src/app/components/nexus-nomad.tsx");
const facilityMap = read("src/app/components/facility-map-page.tsx");
const facilityFinance = read("src/app/components/facility-finance-page.tsx");
const businessMap = read("src/app/components/business-map-editor.tsx");
const facilityModel = read("src/lib/facility-depth-model.ts");
const workshopApi = read("src/lib/workshop-api.ts");
const workshopModel = read("src/lib/workshop-model.ts");
const personalWorkshop = read("src/app/components/personal-files-workshop.tsx");
const routes = read("src/app/routes.tsx");
const arcadeStore = read("src/app/components/arcade-store.tsx");
const arcadeManager = read("src/app/components/dm-arcade-manager.tsx");
const customization = read("src/app/components/customization-page.tsx");
const initialData = read("src/app/components/initial-data.tsx");
const intelliInterface = read("src/app/components/intelli-interface.tsx");

for (const [source, jsx] of [
  [edge, false],
  [creditsApi, false],
  [workshopApi, false],
  [workshopModel, false],
  [accountPage, true],
  [commerce, true],
  [personalFiles, true],
  [nexusNomad, true],
  [facilityMap, true],
  [facilityFinance, true],
  [personalWorkshop, true],
  [routes, true],
]) {
  parse(source, { sourceType: "module", plugins: jsx ? ["typescript", "jsx"] : ["typescript"] });
}

function sliceBetween(source, marker, nextMarker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing marker: ${marker}`);
  const end = nextMarker ? source.indexOf(nextMarker, start + marker.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

const applyWallet = sliceBetween(migration, "create or replace function public.wallet_apply_transaction", "create or replace function public.wallet_migrate_player_legacy");
const migrateWallet = sliceBetween(migration, "create or replace function public.wallet_migrate_player_legacy", "create or replace function public.wallet_reverse_transaction");
const reverseWallet = sliceBetween(migration, "create or replace function public.wallet_reverse_transaction", "create or replace function public.wallet_commit_office_state");
const officeCommit = sliceBetween(migration, "create or replace function public.wallet_commit_office_state", "create or replace function public.wallet_commerce_purchase");
const commercePurchase = sliceBetween(migration, "create or replace function public.wallet_commerce_purchase", "create or replace function public.wallet_save_commerce_catalog");
const commerceCatalog = sliceBetween(migration, "create or replace function public.wallet_save_commerce_catalog", "create or replace function public.workshop_complete_build");
const workshopComplete = sliceBetween(migration, "create or replace function public.workshop_complete_build", "revoke all on function");

// Schema, preservation, and one-time migration.
assert.match(migration, /create table if not exists public\.player_credit_accounts/);
assert.match(migration, /create table if not exists public\.player_credit_transactions/);
assert.match(migration, /balance bigint not null default 0 check \(balance >= 0/);
assert.match(migration, /check \(balance_after = balance_before \+ amount\)/);
assert.match(migration, /player_credit_transactions_idempotency_idx/);
assert.match(migration, /player_credit_transactions_reversal_idx/);
assert.match(migration, /enable row level security/);
assert.match(migration, /prevent_credit_transaction_mutation/);
assert.match(migration, /Credit audit transactions are immutable/);
assert.match(migration, /player_credit_migrations/);
assert.match(migration, /on conflict \(player_id\) do nothing/);
assert.match(migration, /lower\(trim\(coalesce\(item\.data->>'name', ''\)\)\) = 'credits'/);
assert.match(migration, /from public\.player_quick_items row/);
assert.match(migration, /lower\(trim\(coalesce\(item\.value->>'name', ''\)\)\) = 'credits'/);
assert.doesNotMatch(migration, /delete from public\.app_items[^\n]*credits/i);
assert.doesNotMatch(migration, /delete from public\.player_quick_items/i);
assert.doesNotMatch(migration, /delete from public\.app_nexus_nomad_state/i);
assert.match(migration, /ensure_player_credit_account_after_insert/);
assert.match(migrateWallet, /pg_advisory_xact_lock/);
assert.match(migrateWallet, /Opening balance migrated from legacy money systems/);

// Wallet mutation and audit guarantees.
assert.match(applyWallet, /for update/);
assert.match(applyWallet, /v_after < 0/);
assert.match(applyWallet, /Insufficient Credits/);
assert.match(applyWallet, /different transaction/);
assert.match(applyWallet, /insert into public\.player_credit_transactions/);
assert.match(reverseWallet, /reversal_of is not null/);
assert.match(reverseWallet, /already been reversed/);
assert.match(reverseWallet, /v_after < 0/);
assert.match(reverseWallet, /'reversal'/);
assert.doesNotMatch(reverseWallet, /update public\.player_credit_transactions/);

// Atomic integrations use the same locked wallet.
assert.match(officeCommit, /app_nexus_nomad_state[^;]+for update/s);
assert.match(officeCommit, /wallet_apply_transaction/);
assert.match(commercePurchase, /player_credit_accounts[^;]+for update/s);
assert.match(commercePurchase, /app_commerce_shops[^;]+for update/s);
assert.match(commercePurchase, /wallet_apply_transaction/);
assert.match(commercePurchase, /insert into public\.app_commerce_ledger/);
assert.match(commercePurchase, /insert into public\.app_items/);
assert.match(commercePurchase, /Credits cannot be delivered as an inventory item/);
assert.match(commercePurchase, /commerce_credit_orders/);
assert.match(commercePurchase, /Insufficient Credits/);
assert.match(commercePurchase, /'revision'.+\+ 1/s);
assert.match(commerceCatalog, /COMMERCE_CATALOG_CONFLICT/);
assert.match(commerceCatalog, /for update/);
assert.match(commerceCatalog, /v_revision <> v_expected/);
assert.match(commerceCatalog, /jsonb_build_object\('currency', 'Credits'\)/);
assert.match(workshopComplete, /wallet_apply_transaction/);
assert.match(workshopComplete, /app_workshop_builds[^;]+for update/s);
assert.match(workshopComplete, /player_workshop_storage[^;]+for update/s);

// Edge permissions and API boundaries.
const ownAccountRoute = sliceBetween(edge, "app.get(`${prefix}/credits/account`", "app.get(`${prefix}/credits/accounts`");
const allAccountsRoute = sliceBetween(edge, "app.get(`${prefix}/credits/accounts`", "app.post(`${prefix}/credits/adjust`");
const adjustRoute = sliceBetween(edge, "app.post(`${prefix}/credits/adjust`", "app.post(`${prefix}/credits/reverse`");
const reverseRoute = sliceBetween(edge, "app.post(`${prefix}/credits/reverse`", "app.post(`${prefix}/commerce/admin/catalog/save`");
const catalogRoute = sliceBetween(edge, "app.post(`${prefix}/commerce/admin/catalog/save`", "app.post(`${prefix}/commerce/purchase`");
const purchaseRoute = sliceBetween(edge, "app.post(`${prefix}/commerce/purchase`", "app.get(`${prefix}/workshop/bootstrap`");
assert.match(ownAccountRoute, /requesterId !== "dm" && requestedId !== requesterId/);
assert.match(allAccountsRoute, /requireDMSession\(c\)/);
assert.match(adjustRoute, /requesterId !== "dm" && targetId !== requesterId/);
assert.match(adjustRoute, /ensureCreditAccountRow\(targetId\)/);
assert.match(adjustRoute, /wallet_apply_transaction/);
assert.match(reverseRoute, /requireDMSession\(c\)/);
assert.match(reverseRoute, /wallet_reverse_transaction/);
assert.match(catalogRoute, /requireDMSession\(c\)/);
assert.match(catalogRoute, /wallet_save_commerce_catalog/);
assert.match(purchaseRoute, /playerId === "dm"/);
assert.match(purchaseRoute, /ensureCreditAccountRow\(playerId\)/);
assert.match(purchaseRoute, /wallet_commerce_purchase/);
assert.match(edge, /app_commerce_shops: \{ write: "dm" \}/);
assert.match(edge, /app_commerce_ledger: \{ write: "dm" \}/);
assert.match(edge, /wallet_migrate_player_legacy/);
assert.match(edge, /workshop\/admin\/build\/complete[\s\S]+ensureCreditAccountRow\(current\.playerId\)/);
assert.match(edge, /Player does not have enough Credits/);

// Player and DM interfaces use the unified account and retain the Arcade exception.
assert.match(creditsApi, /\/credits\/account/);
assert.match(creditsApi, /\/credits\/adjust/);
assert.match(creditsApi, /\/credits\/reverse/);
assert.match(creditsApi, /\/commerce\/purchase/);
assert.match(accountPage, /Record Income/);
assert.match(accountPage, /Record Expense/);
assert.match(accountPage, /Reverse transaction/);
assert.match(accountPage, /immutable audit history/);
assert.match(accountPage, /Choose a Player Account/);
assert.match(routes, /path: "credits"/);
assert.match(routes, /path: "credits\/:playerId"/);
assert.match(personalFiles, /navigate\("\/interface\/credits"\)/);
assert.match(personalFiles, /Physical Currencies & Tokens/);
assert.match(personalFiles, /toLowerCase\(\) !== "credits"/);
assert.match(nexusNomad, /loadCreditAccounts/);
assert.match(nexusNomad, /Player Accounts/);
assert.match(nexusNomad, /Open account history/);
assert.match(nexusNomad, /isLegacyCreditInventoryItem/);
assert.doesNotMatch(nexusNomad, /currency: "gp"|Can be used as shop payment/);
assert.match(facilityMap, /loadCreditAccount/);
assert.match(facilityFinance, /loadCreditAccount/);
assert.match(workshopModel, /credits: number/);
assert.doesNotMatch(workshopModel, /personalFunds: number/);
assert.match(workshopApi, /body\.credits \?\? body\.personalFunds/);
assert.match(personalWorkshop, /data\.credits/);
assert.match(commerce, /purchaseCommerceCart/);
assert.match(commerce, /saveCommerceCatalog/);
assert.match(commerce, /rebaseCommerceCatalog/);
assert.match(commerce, /function wholeNumber/);
assert.match(commerce, /function stockNumber/);
assert.match(commerce, /Credits are account balance and cannot be delivered as an inventory item/);
assert.match(commerce, /Create Reusable Commerce Item/);
assert.match(commerce, /DMItemManagerSection/);
assert.doesNotMatch(commerce, /deductCurrencyFromInventoryState|addPurchasesToInventoryState|saveCommerceShops/);
assert.doesNotMatch(businessMap, /Insufficient Personal Funds/);
assert.doesNotMatch(facilityModel, /owner's Personal Funds/);
assert.doesNotMatch(initialData, /Currency items appear in shop currency selectors|currency balances/);
assert.doesNotMatch(intelliInterface, /currency exchange/);
assert.match(arcadeStore, /Arcade Credits/);
assert.match(arcadeStore, /\$\{price\} AC/);
assert.match(arcadeManager, /Arcade Credits/);
assert.match(customization, /Arcade Credits/);

// Executable contract model for idempotency, reversals, no-negative balances, and atomic checkout.
class WalletModel {
  constructor(balance = 0) {
    this.balance = balance;
    this.transactions = [];
    this.keys = new Map();
  }

  apply({ amount, key, source = "manual", relatedId = "" }) {
    const existing = this.keys.get(key);
    if (existing) {
      assert.deepEqual({ amount, source, relatedId }, { amount: existing.amount, source: existing.source, relatedId: existing.relatedId });
      return existing;
    }
    assert.notEqual(amount, 0);
    assert.ok(this.balance + amount >= 0, "wallet cannot become negative");
    const transaction = { id: `tx-${this.transactions.length + 1}`, amount, source, relatedId, before: this.balance, after: this.balance + amount, reversalOf: "" };
    this.balance = transaction.after;
    this.transactions.push(transaction);
    this.keys.set(key, transaction);
    return transaction;
  }

  reverse(transaction, key) {
    assert.equal(this.transactions.some((entry) => entry.reversalOf === transaction.id), false, "transaction can only be reversed once");
    const reversal = this.apply({ amount: -transaction.amount, key, source: "dm-reversal", relatedId: transaction.relatedId });
    reversal.reversalOf = transaction.id;
    return reversal;
  }
}

function purchaseModel(wallet, product, quantity, key, orders) {
  if (orders.has(key)) return orders.get(key);
  const before = { balance: wallet.balance, stock: product.stock, txCount: wallet.transactions.length };
  try {
    assert.ok(quantity >= 1);
    assert.ok(product.stock < 0 || product.stock >= quantity, "stock is sufficient");
    const total = product.price * quantity;
    wallet.apply({ amount: -total, key: `commerce:${key}`, source: "commerce", relatedId: key });
    if (product.stock >= 0) product.stock -= quantity;
    const order = { total, quantity };
    orders.set(key, order);
    return order;
  } catch (error) {
    wallet.balance = before.balance;
    product.stock = before.stock;
    wallet.transactions.splice(before.txCount);
    wallet.keys.delete(`commerce:${key}`);
    throw error;
  }
}

const wallet = new WalletModel(100);
const income = wallet.apply({ amount: 40, key: "income-1" });
assert.equal(wallet.balance, 140);
assert.equal(wallet.apply({ amount: 40, key: "income-1" }), income);
assert.equal(wallet.transactions.length, 1);
assert.throws(() => wallet.apply({ amount: -141, key: "expense-too-large" }));
assert.equal(wallet.balance, 140);
wallet.reverse(income, "reverse-income-1");
assert.equal(wallet.balance, 100);
assert.throws(() => wallet.reverse(income, "reverse-income-2"));

const product = { price: 15, stock: 3 };
const orders = new Map();
assert.deepEqual(purchaseModel(wallet, product, 2, "order-1", orders), { total: 30, quantity: 2 });
assert.equal(wallet.balance, 70);
assert.equal(product.stock, 1);
purchaseModel(wallet, product, 2, "order-1", orders);
assert.equal(wallet.balance, 70);
assert.equal(product.stock, 1);
assert.throws(() => purchaseModel(wallet, product, 2, "order-2", orders));
assert.equal(wallet.balance, 70);
assert.equal(product.stock, 1);

process.stdout.write("Unified Credits checks passed.\n");
