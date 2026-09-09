import { api } from './client';

export interface Coupon {
  id: string;
  codice: string;
  tipo: 'PERCENTUALE' | 'FISSO';
  valore: string;
  usiMax: number | null;
  usiAttuali: number;
  validoDal: string | null;
  validoAl: string | null;
  attivo: boolean;
  eventoId: string | null;
  promoterId: string | null;
  compensoTipo: 'PERCENTUALE' | 'FISSO' | null;
  compensoValore: string | null;
  compensoFissoPer: 'ACQUISTO' | 'PASSEGGERO' | null;
  utenteId: string | null;
  inviatoIl: string | null;
}
export interface CouponInput {
  codice: string; tipo: 'PERCENTUALE' | 'FISSO'; valore: number; usiMax?: number;
  validoDal?: string | null; validoAl?: string | null;
  attivo?: boolean; eventoId?: string | null; promoterId?: string | null;
  compensoTipo?: 'PERCENTUALE' | 'FISSO' | null; compensoValore?: number | null; compensoFissoPer?: 'ACQUISTO' | 'PASSEGGERO' | null;
  utenteId?: string | null;
}

export const couponApi = {
  list: () => api.get<Coupon[]>('/api/coupon'),
  create: (input: CouponInput) => api.post<Coupon>('/api/coupon', input),
  update: (id: string, input: Partial<CouponInput>) => api.put<Coupon>(`/api/coupon/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/coupon/${id}`),
  inviaEmail: (id: string) => api.post<{ inviata: boolean; email: string }>(`/api/coupon/${id}/invia-email`, {}),
  // Pubblica, come /api/credito — il cliente vede i suoi voucher nell'account.
  voucherDiCliente: (email: string) => api.get<Coupon[]>(`/api/coupon/voucher?email=${encodeURIComponent(email)}`),
};
