export interface CostBreakdown {
  date: string;
  dimension: string;
  cost: number;
}

export interface CostResponse {
  totalLast30d: number;
  breakdown: CostBreakdown[];
}
