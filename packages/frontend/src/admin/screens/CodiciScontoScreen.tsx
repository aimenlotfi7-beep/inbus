import { useState } from 'react';
import { CouponScreen } from './CouponScreen';
import { VoucherScreen } from './VoucherScreen';

/** Codici sconto (proprietario, settembre 2026): coupon pubblici e voucher
 *  personali erano due voci in due gruppi diversi del menu, pur essendo la
 *  stessa cosa. Qui stanno insieme, con due linguette; le due schermate
 *  restano quelle di prima, ognuna con il suo pulsante "+ Nuovo". */
export function CodiciScontoScreen() {
  const [tab, setTab] = useState<'pubblici' | 'personali'>('pubblici');
  return (
    <div>
      <div className="mini-tabs">
        <button type="button" className={`mini-tab${tab === 'pubblici' ? ' active' : ''}`} onClick={() => setTab('pubblici')}>Pubblici</button>
        <button type="button" className={`mini-tab${tab === 'personali' ? ' active' : ''}`} onClick={() => setTab('personali')}>Personali</button>
      </div>
      {tab === 'pubblici' ? <CouponScreen /> : <VoucherScreen />}
    </div>
  );
}
