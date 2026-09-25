import { PaymentMethod } from '../../../orders/domain/entities/order.entity';
import {
  DeliveryFeeMode,
  IBusinessHours,
  IDeliveryFeeZone,
  IRestaurant,
  IRestaurantAddress,
  IRestaurantBanner,
  PixKeyType,
} from '../../domain/entities/restaurant.entity';
import {
  IRestaurantRepository,
  RestaurantProfileUpdate,
} from '../../domain/repositories/restaurant.repository.interface';
import { RestaurantModel } from '../models/restaurant.mongoose.model';

interface RestaurantLeanDocument {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
  logoUrl?: string;
  primaryColor?: string;
  onPrimaryColor?: string;
  defaultProductImageUrl?: string;
  businessHours?: IBusinessHours[];
  address?: IRestaurantAddress;
  phone?: string;
  document?: string;
  minimumOrderValue?: number;
  deliveryFeeCents?: number;
  welcomeMessage?: string;
  orderConfirmationGreeting?: string;
  shareMessage?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
  whatsappConnected?: boolean;
  productImageOnRight?: boolean;
  showBestSellers?: boolean;
  bestSellersCount?: number;
  showHighlights?: boolean;
  showBanners?: boolean;
  banners?: IRestaurantBanner[];
  allowCustomerCancelOrder?: boolean;
  deliveryFeeMode?: DeliveryFeeMode;
  deliveryFeeZones?: IDeliveryFeeZone[];
  instagramUrl?: string;
  rating?: number;
  ratingCount?: number;
  showHighlightsInMultipleRows?: boolean;
  cartSuggestionsCount?: number;
  category?: string;
  businessHoursReviewedAt?: Date;
  acceptedPaymentMethods?: PaymentMethod[];
  notifyRestaurantOnNewOrder?: boolean;
  newOrderRestaurantWhatsAppTemplate?: string;
  notifyCustomerOnOrderConfirmed?: boolean;
  orderConfirmedWhatsAppTemplate?: string;
  notifyCustomerOnPixConfirmed?: boolean;
  pixConfirmedWhatsAppTemplate?: string;
}

const ALL_PAYMENT_METHODS: PaymentMethod[] = ['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer'];

function toEntity(doc: RestaurantLeanDocument): IRestaurant {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    isActive: doc.isActive,
    logoUrl: doc.logoUrl,
    primaryColor: doc.primaryColor,
    onPrimaryColor: doc.onPrimaryColor,
    defaultProductImageUrl: doc.defaultProductImageUrl,
    businessHours: doc.businessHours ?? [],
    address: doc.address,
    phone: doc.phone,
    document: doc.document,
    minimumOrderValue: doc.minimumOrderValue ?? 0,
    deliveryFeeCents: doc.deliveryFeeCents ?? 0,
    welcomeMessage: doc.welcomeMessage,
    orderConfirmationGreeting: doc.orderConfirmationGreeting,
    shareMessage: doc.shareMessage,
    pixKey: doc.pixKey,
    pixKeyType: doc.pixKeyType,
    pixBeneficiaryName: doc.pixBeneficiaryName,
    whatsappConnected: doc.whatsappConnected ?? false,
    productImageOnRight: doc.productImageOnRight ?? true,
    showBestSellers: doc.showBestSellers ?? false,
    bestSellersCount: doc.bestSellersCount ?? 6,
    showHighlights: doc.showHighlights ?? true,
    showBanners: doc.showBanners ?? true,
    banners: doc.banners ?? [],
    allowCustomerCancelOrder: doc.allowCustomerCancelOrder ?? true,
    deliveryFeeMode: doc.deliveryFeeMode ?? 'fixed',
    deliveryFeeZones: doc.deliveryFeeZones ?? [],
    instagramUrl: doc.instagramUrl,
    rating: doc.rating ?? 0,
    ratingCount: doc.ratingCount ?? 0,
    showHighlightsInMultipleRows: doc.showHighlightsInMultipleRows ?? false,
    cartSuggestionsCount: doc.cartSuggestionsCount,
    category: doc.category,
    businessHoursReviewedAt: doc.businessHoursReviewedAt,
    acceptedPaymentMethods: doc.acceptedPaymentMethods ?? ALL_PAYMENT_METHODS,
    notifyRestaurantOnNewOrder: doc.notifyRestaurantOnNewOrder ?? true,
    newOrderRestaurantWhatsAppTemplate: doc.newOrderRestaurantWhatsAppTemplate,
    notifyCustomerOnOrderConfirmed: doc.notifyCustomerOnOrderConfirmed ?? true,
    orderConfirmedWhatsAppTemplate: doc.orderConfirmedWhatsAppTemplate,
    notifyCustomerOnPixConfirmed: doc.notifyCustomerOnPixConfirmed ?? true,
    pixConfirmedWhatsAppTemplate: doc.pixConfirmedWhatsAppTemplate,
  };
}

export class RestaurantMongooseRepository implements IRestaurantRepository {
  async create(input: {
    name: string;
    slug: string;
    phone?: string;
    businessHours?: IBusinessHours[];
    showHighlights?: boolean;
    showBanners?: boolean;
    allowCustomerCancelOrder?: boolean;
    productImageOnRight?: boolean;
    category?: string;
    newOrderRestaurantWhatsAppTemplate?: string;
  }): Promise<IRestaurant> {
    const doc = await RestaurantModel.create(input);
    return toEntity(doc.toObject());
  }

  async findBySlug(slug: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ slug }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findById(id: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findById(id).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async updateProfile(id: string, patch: RestaurantProfileUpdate): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateBusinessHours(id: string, businessHours: IBusinessHours[]): Promise<IRestaurant> {
    // specs/0039-onboarding-primeiro-acesso REQ-4 — qualquer save de verdade nesta tela marca o
    // horário como revisado (diferencia de nunca ter revisado desde o default automático do
    // autocadastro, REQ-1), independente de mudar algum valor ou só confirmar o que já estava.
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { businessHours, businessHoursReviewedAt: new Date() } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateSlug(id: string, slug: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { slug } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async findWhatsappConnectedIds(): Promise<string[]> {
    const docs = await RestaurantModel.find({ whatsappConnected: true }, { _id: 1 }).lean<{ _id: string }[]>();
    return docs.map((doc) => String(doc._id));
  }

  async setWhatsappConnected(id: string, connected: boolean): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { whatsappConnected: connected } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateRatingStats(id: string, rating: number, ratingCount: number): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { rating, ratingCount } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }
}
