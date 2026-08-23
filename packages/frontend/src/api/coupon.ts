import { api } from './client';

export interface Coupon {
  id: string;
  codice: string;
  tipo: 'PERCENTUALE' | 'FISSO';
  valore: string;
  usiMax: number | null;
  usiAttuali: number;
  attivo: boolean;
  eventoId: string | null;
}
export interface CouponInput {
  codice: string; tipo: 'PERCENTUALE' | 'FISSO'; valore: number; usiMax?: number; attivo?: boolean; eventoId?: string | null;
}

export const couponApi = {
  list: () => api.get<Coupon[]>('/api/coupon'),
  create: (input: CouponInput) => api.post<Coupon>('/api/coupon', input),
  update: (id: string, input: Partial<CouponInput>) => api.put<Coupon>(`/api/coupon/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/coupon/${id}`),
};
