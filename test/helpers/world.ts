/**
 * Arma los servicios reales del backend sobre la base simulada (fake-model.ts), con el correo
 * simulado. Las pruebas unitarias de los servicios lo usan para ejercitar la lógica de negocio
 * sin levantar Nest ni MongoDB.
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AgreementsService } from '../../src/agreements/agreements.service';
import {
  Agreement,
  AgreementSchema,
} from '../../src/agreements/schemas/agreement.schema';
import { AuthService } from '../../src/auth/auth.service';
import { CategoriesService } from '../../src/categories/categories.service';
import {
  Category,
  CategorySchema,
} from '../../src/categories/schemas/category.schema';
import { ConsignorsService } from '../../src/consignors/consignors.service';
import { DeadlinesService } from '../../src/deadlines/deadlines.service';
import { GarmentsService } from '../../src/garments/garments.service';
import { Counter, CounterSchema } from '../../src/garments/schemas/counter.schema';
import { Garment, GarmentSchema } from '../../src/garments/schemas/garment.schema';
import { MailService } from '../../src/mail/mail.service';
import type { EmailDetail } from '../../src/mail/templates';
import { MerchantsService } from '../../src/merchants/merchants.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import {
  Notification,
  NotificationSchema,
} from '../../src/notifications/schemas/notification.schema';
import { PayoutsService } from '../../src/payouts/payouts.service';
import { ProposalsService } from '../../src/proposals/proposals.service';
import { Proposal, ProposalSchema } from '../../src/proposals/schemas/proposal.schema';
import { ReceptionsService } from '../../src/receptions/receptions.service';
import {
  Reception,
  ReceptionSchema,
} from '../../src/receptions/schemas/reception.schema';
import { ReportsService } from '../../src/reports/reports.service';
import { ReturnsService } from '../../src/returns/returns.service';
import {
  GarmentReturn,
  GarmentReturnSchema,
} from '../../src/returns/schemas/return.schema';
import { SalesPointsService } from '../../src/sales-points/sales-points.service';
import { SalesService } from '../../src/sales/sales.service';
import { Sale, SaleSchema } from '../../src/sales/schemas/sale.schema';
import { SeedService } from '../../src/seed/seed.service';
import { Consignor, ConsignorSchema } from '../../src/users/schemas/consignor.schema';
import { Merchant, MerchantSchema } from '../../src/users/schemas/merchant.schema';
import { User, UserSchema } from '../../src/users/schemas/user.schema';
import { UsersService } from '../../src/users/users.service';
import { FakeDb } from './fake-model';

export type MailMock = {
  [K in keyof MailService]: jest.Mock;
};

export function mailMock(): MailMock {
  return {
    sendVerificationCode: jest.fn(() => Promise.resolve()),
    sendLifecycleNotification: jest.fn(() => Promise.resolve()),
    sendSupportTicket: jest.fn(() => Promise.resolve()),
    sendSupportConfirmation: jest.fn(() => Promise.resolve()),
  };
}

export function config(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

export function buildWorld() {
  const db = new FakeDb();
  const userModel = db.model<User>(User.name, UserSchema);
  const consignorModel = db.discriminator<Consignor>(
    userModel as never,
    Consignor.name,
    ConsignorSchema,
    'consignor',
  );
  const merchantModel = db.discriminator<Merchant>(
    userModel as never,
    Merchant.name,
    MerchantSchema,
    'merchant',
  );
  const models = {
    user: userModel,
    consignor: consignorModel,
    merchant: merchantModel,
    garment: db.model<Garment>(Garment.name, GarmentSchema),
    counter: db.model<Counter>(Counter.name, CounterSchema),
    category: db.model<Category>(Category.name, CategorySchema),
    notification: db.model<Notification>(Notification.name, NotificationSchema),
    proposal: db.model<Proposal>(Proposal.name, ProposalSchema),
    agreement: db.model<Agreement>(Agreement.name, AgreementSchema),
    reception: db.model<Reception>(Reception.name, ReceptionSchema),
    sale: db.model<Sale>(Sale.name, SaleSchema),
    return: db.model<GarmentReturn>(GarmentReturn.name, GarmentReturnSchema),
  };
  const m = models as Record<keyof typeof models, never>;
  const mail = mailMock();
  const mailService = mail as unknown as MailService;

  const users = new UsersService(m.user, m.merchant, m.consignor);
  const categories = new CategoriesService(m.category, m.merchant);
  const notifications = new NotificationsService(
    m.notification,
    users,
    mailService,
    config(),
  );
  const garments = new GarmentsService(
    m.garment,
    m.counter,
    notifications,
    categories,
  );
  const agreements = new AgreementsService(m.agreement, garments);
  const salesPoints = new SalesPointsService(m.merchant);
  const proposals = new ProposalsService(
    m.proposal,
    garments,
    agreements,
    users,
    salesPoints,
  );
  const receptions = new ReceptionsService(
    m.reception,
    garments,
    agreements,
    salesPoints,
    users,
  );
  const sales = new SalesService(m.sale, garments, agreements, users);
  const returns = new ReturnsService(m.return, garments, salesPoints);
  const consignors = new ConsignorsService(m.consignor, garments);
  const merchants = new MerchantsService(m.merchant);
  const payouts = new PayoutsService(garments, sales, users);
  const reports = new ReportsService(
    garments,
    agreements,
    sales,
    receptions,
    consignors,
    users,
  );
  const deadlines = new DeadlinesService(
    agreements,
    garments,
    users,
    salesPoints,
    notifications,
  );
  const jwt = new JwtService({ secret: 'test-secret' });
  const auth = new AuthService(users, jwt, mailService);
  const seed = new SeedService(
    m.user,
    m.consignor,
    m.merchant,
    m.garment,
    m.counter,
    m.proposal,
    m.agreement,
    m.sale,
    m.reception,
    m.notification,
    m.return,
    categories,
  );

  return {
    db,
    models,
    mail,
    jwt,
    users,
    categories,
    notifications,
    garments,
    agreements,
    salesPoints,
    proposals,
    receptions,
    sales,
    returns,
    consignors,
    merchants,
    payouts,
    reports,
    deadlines,
    auth,
    seed,
  };
}

export type World = ReturnType<typeof buildWorld>;

/** Un correo de aviso enviado por NotificationsService (lo que recibió MailService). */
export interface SentMail {
  to: string;
  name: string;
  type: string;
  text: string;
  url: string;
  details: EmailDetail[];
}

export function sentMails(w: { mail: MailMock }): SentMail[] {
  return (w.mail.sendLifecycleNotification.mock.calls as unknown[][]).map(
    ([to, name, type, text, url, details]) => ({
      to: to as string,
      name: name as string,
      type: type as string,
      text: text as string,
      url: url as string,
      details: (details as EmailDetail[] | undefined) ?? [],
    }),
  );
}

export function sentMail(
  w: { mail: MailMock },
  type: string,
): SentMail | undefined {
  return sentMails(w).find((mail) => mail.type === type);
}

export const labels = (mail?: SentMail): string[] =>
  (mail?.details ?? []).map((detail) => detail.label);
