export interface DashboardKPIs {
  total_revenue: number;
  total_sales: number;
  unique_customers: number;
  avg_check: number;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface RevenueByCategory {
  category_name: string;
  total_revenue: number;
  sales_count: number;
}

export interface TopProduct {
  product_name: string;
  total_revenue: number;
}

export interface TopCity {
  city_name: string;
  total_revenue: number;
  sales_count: number;
}

export interface TopSeller {
  seller_name: string;
  gender: 'M' | 'F';
  sales_count: number;
  total_revenue: number;
}

export interface DiscountAnalysis {
  discount_range: string;
  avg_discount: number;
  total_revenue: number;
  sales_count: number;
}

export interface GenderCategoryAnalysis {
  gender: 'M' | 'F';
  category_name: string;
  total_revenue: number;
  sales_count: number;
}

export type RPCFunction = 
  | 'dashboard_kpis'
  | 'monthly_revenue'
  | 'revenue_by_category'
  | 'top_products'
  | 'top_cities'
  | 'top_sellers'
  | 'discount_analysis'
  | 'gender_category_analysis';
