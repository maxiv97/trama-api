// Resultado de los vencimientos de venta de un comercio: de las prendas que terminaron la ventana
// sin venderse, cuántas retiró el cedente y cuántas no, y qué destino se les dio a las no retiradas.
export interface ExpiryOutcomes {
  expiredCount: number; // total que terminaron la ventana sin venderse
  awaitingPickupCount: number; // aún por retirar, sin resolver
  returnedCount: number; // retiradas por el cedente
  unclaimedCount: number; // no retiradas (venció el plazo para retirarlas)
  pickupRate: number | null; // retiradas / (retiradas + no retiradas)
  donatedCount: number; // no retiradas que el comercio donó
  keptCount: number; // no retiradas que el comercio conservó
  otherCount: number; // no retiradas con otro destino
  unclaimedPendingCount: number; // no retiradas sin destino registrado
}
