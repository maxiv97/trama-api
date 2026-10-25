import { buildDemoDataset } from '../../../src/seed/demo-data';

describe('Lote de demostración', () => {
  const now = new Date();
  const data = buildDemoDataset(now);

  it('ningún hecho de la historia de las prendas queda en el futuro', () => {
    const dates = [
      ...data.garments.flatMap((g) => [
        g.createdAt,
        ...g.timeline.map((e) => e.date),
      ]),
      ...data.notifications.map((n) => n.date),
      ...data.receptions.map((r) => r.receivedAt),
      ...data.sales.flatMap((s) =>
        s.paidAt ? [s.soldAt, s.paidAt] : [s.soldAt],
      ),
      ...data.returns.map((r) => r.returnedAt),
    ];
    expect(dates.filter((d) => d.getTime() > now.getTime())).toEqual([]);
  });

  it('es reproducible: dos corridas con la misma fecha generan el mismo lote', () => {
    expect(buildDemoDataset(now)).toEqual(data);
  });
});
