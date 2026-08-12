/** Shapes returned by the Phase 3-6 API. */

export type Role = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTS';

export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR';
export type CustomerStatus = 'LEAD' | 'ACTIVE' | 'INACTIVE';
export type ChallanStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type MovementType = 'IN' | 'OUT';

/** Prisma serialises Decimal columns as strings, so money arrives as text. */
export type Decimalish = string | number;

export interface LoginResponse {
  token: string;
  role: Role;
  name: string;
}

/** Every list endpoint answers with this envelope. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  businessName: string | null;
  gstNumber: string | null;
  type: CustomerType;
  address: string | null;
  status: CustomerStatus;
  followUpDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  customerId: string;
  text: string;
  createdAt: string;
}

/** GET /customers/:id includes notes and the five most recent challans. */
export interface CustomerDetail extends Customer {
  notes: Note[];
  challans: Challan[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  unitPrice: Decimalish;
  currentStock: number;
  minStockAlert: number;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  quantityChanged: number;
  type: MovementType;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface ChallanItem {
  id: string;
  challanId: string;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: Decimalish;
  quantity: number;
}

export interface Challan {
  id: string;
  challanNumber: string;
  customerId: string;
  totalQuantity: number;
  status: ChallanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /challans embeds a trimmed customer for display. */
export interface ChallanListRow extends Challan {
  customer: Pick<Customer, 'id' | 'name'>;
}

export interface ChallanDetail extends Challan {
  items: ChallanItem[];
  customer: Customer;
}

/** The `shortages` payload a 409 from POST /challans/:id/confirm carries. */
export interface Shortage {
  productId: string;
  productName: string;
  available: number;
  requested: number;
}

export interface InsufficientStockBody {
  error: string;
  shortages?: Shortage[];
}
