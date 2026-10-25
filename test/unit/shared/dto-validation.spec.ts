import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterConsignorDto } from '../../../src/auth/dto/register-consignor.dto';
import { RegisterMerchantDto } from '../../../src/auth/dto/register-merchant.dto';
import { UpdateMerchantDto } from '../../../src/merchants/dto/update-merchant.dto';
import { RegisterDispositionDto } from '../../../src/returns/dto/register-disposition.dto';
import { SalesPointDto } from '../../../src/sales-points/dto/sales-point.dto';
import { CreateTicketDto } from '../../../src/support/dto/create-ticket.dto';
import { ReportFiltersDto, toReportFilters } from '../../../src/shared/dto/report-filters.dto';
import { dateInRange, garmentInScope } from '../../../src/shared/report-filters';
import { formatArs, formatDate } from '../../../src/shared/format';
import { monthKey } from '../../../src/shared/utils/month.util';

// Errores de validación por propiedad (incluye las anidadas como "terms.payoutDay").
async function errors<T extends object>(
  cls: new () => T,
  plain: object,
): Promise<string[]> {
  const result = await validate(plainToInstance(cls, plain), {
    whitelist: true,
  });
  const paths: string[] = [];
  const walk = (list: typeof result, prefix = '') => {
    for (const e of list) {
      if (e.constraints) paths.push(prefix + e.property);
      walk(e.children ?? [], `${prefix}${e.property}.`);
    }
  };
  walk(result);
  return paths;
}

const point = {
  name: 'Centro',
  address: 'Calle 1',
  phone: '1',
  geo: { lat: 1, lng: 2 },
  receptionSchedule: { days: 'Lun', hours: '10', instructions: '-' },
};
const merchant = {
  name: 'Laura',
  email: 'laura@test.com',
  phone: '1',
  password: 'secreto',
  businessName: 'Percha',
  cuit: '30',
  location: { neighborhood: 'Centro', city: 'Córdoba' },
  commissionConfig: { consignorPercentage: 60, merchantPercentage: 40 },
  terms: {
    saleWindowMonths: 3,
    deliveryDays: 7,
    pickupDays: 15,
    payoutDay: 10,
  },
  salesPoint: point,
};

describe('Validación de los datos de entrada (DTO)', () => {
  it('registro de comercio: válido y con los plazos fuera de rango', async () => {
    expect(await errors(RegisterMerchantDto, merchant)).toEqual([]);
    expect(
      await errors(RegisterMerchantDto, {
        ...merchant,
        terms: {
          saleWindowMonths: 0,
          deliveryDays: 31,
          pickupDays: 61,
          payoutDay: 29,
        },
      }),
    ).toEqual([
      'terms.saleWindowMonths',
      'terms.deliveryDays',
      'terms.pickupDays',
      'terms.payoutDay',
    ]);
    expect(
      await errors(RegisterMerchantDto, {
        ...merchant,
        salesPoint: { ...point, geo: { lat: 'x', lng: 2 } },
      }),
    ).toEqual(['salesPoint.geo.lat']);
  });

  it('actualización del comercio y punto de venta', async () => {
    const update = {
      businessName: merchant.businessName,
      email: merchant.email,
      phone: merchant.phone,
      location: merchant.location,
      commissionConfig: merchant.commissionConfig,
      terms: merchant.terms,
    };
    expect(await errors(UpdateMerchantDto, update)).toEqual([]);
    expect(
      await errors(UpdateMerchantDto, {
        ...update,
        commissionConfig: { consignorPercentage: 101, merchantPercentage: -1 },
      }),
    ).toEqual([
      'commissionConfig.consignorPercentage',
      'commissionConfig.merchantPercentage',
    ]);
    expect(await errors(SalesPointDto, point)).toEqual([]);
    expect(
      await errors(SalesPointDto, {
        ...point,
        receptionSchedule: { days: 'Lun' },
      }),
    ).toEqual(['receptionSchedule.hours', 'receptionSchedule.instructions']);
  });

  it('registro de cedente: exige la dirección con calle y número', async () => {
    const consignor = {
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@test.com',
      phone: '1',
      password: 'secreto',
      dni: '1',
      location: {
        street: 'Calle',
        number: '1',
        neighborhood: 'Centro',
        city: 'Córdoba',
      },
    };
    expect(await errors(RegisterConsignorDto, consignor)).toEqual([]);
    expect(
      await errors(RegisterConsignorDto, {
        ...consignor,
        location: { neighborhood: 'Centro', city: 'Córdoba' },
      }),
    ).toEqual(['location.street', 'location.number']);
  });

  it('destino de una prenda no retirada: la nota es obligatoria con "otro destino"', async () => {
    expect(
      await errors(RegisterDispositionDto, { disposition: 'donated' }),
    ).toEqual([]);
    expect(
      await errors(RegisterDispositionDto, { disposition: 'other' }),
    ).toEqual(['note']);
    expect(
      await errors(RegisterDispositionDto, { disposition: 'kept', note: 'x' }),
    ).toEqual(['note']);
    expect(
      await errors(RegisterDispositionDto, { disposition: 'tirada' }),
    ).toEqual(['disposition']);
  });

  it('ticket de soporte: recorta espacios y valida la captura', async () => {
    const ticket = {
      motivo: 'otro',
      rol: 'cedente',
      nombre: '  Ana  ',
      email: ' ana@test.com ',
      mensaje: 'Necesito ayuda con mi liquidación.',
    };
    expect(await errors(CreateTicketDto, ticket)).toEqual([]);
    expect(plainToInstance(CreateTicketDto, ticket).nombre).toBe('Ana');
    expect(
      await errors(CreateTicketDto, {
        ...ticket,
        nombre: 1,
        captura: 'data:text/plain;base64,AAA',
      }),
    ).toEqual(['nombre', 'captura']);
  });

  it('filtros de reportes y utilidades de formato', async () => {
    expect(
      await errors(ReportFiltersDto, { from: '2026-10-01', to: '10/2026' }),
    ).toEqual(['to']);
    expect(toReportFilters({})).toEqual({
      from: undefined,
      to: undefined,
      salesPointId: undefined,
      category: undefined,
      consignorId: undefined,
    });
    const g = { salesPointId: 'sp', category: 'Remeras', consignorId: 'c' };
    expect(garmentInScope(g, {})).toBe(true);
    expect(garmentInScope(g, { salesPointId: 'otro' })).toBe(false);
    expect(garmentInScope(g, { category: 'Otra' })).toBe(false);
    expect(garmentInScope(g, { consignorId: 'otro' })).toBe(false);
    const d = new Date(2026, 9, 15);
    expect(dateInRange(d, { from: new Date(2026, 9, 16) })).toBe(false);
    expect(dateInRange(d, { to: new Date(2026, 9, 14) })).toBe(false);
    expect(
      dateInRange(d, { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31) }),
    ).toBe(true);
    expect(formatArs(14000.4)).toBe('$14.000');
    expect(formatDate(d)).toBe('15/10/2026');
    expect(monthKey(d)).toBe('2026-10');
  });
});
