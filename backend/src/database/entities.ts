import { PasswordReset } from '../auth/password-reset.entity';
import { AuditLog } from '../audit/audit.entity';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Favourite } from '../favourites/favourite.entity';
import { SavedPlace } from '../geo/place.entity';
import { Notification } from '../notifications/notification.entity';
import { Order, OrderItem } from '../orders/order.entity';
import { Payment } from '../payments/payment.entity';
import { Product } from '../products/product.entity';
import { ShopRider } from '../shop-riders/shop-rider.entity';
import { Shop } from '../shops/shop.entity';
import { PromoCode, PromoRedemption, SosAlert, Trip, TripOffer } from '../trips/trip.entities';
import { Document } from '../uploads/document.entity';
import { Upload } from '../uploads/upload.entity';
import { User } from '../users/user.entity';
import { Vehicle } from '../vehicles/vehicle.entity';

/** Every table. Add new entities here: the app and the migration tool both read this list. */
export const entities = [
  User, Shop, Product, Order, OrderItem, Payment, LedgerEntry, Upload, Document, Notification, Favourite, ShopRider,
  Vehicle, SavedPlace, Trip, TripOffer, PromoCode, PromoRedemption, SosAlert, PasswordReset, AuditLog,
];
