/**
 * Your data, your call: a full export and account deletion (the privacy promises in the notice people accept at sign-up).
 * Deleting removes personal details, pictures' ownership, favourites, saved places, notifications, vehicles and verification
 * documents. Records of past orders and trips are kept for accounting, but they no longer carry a name.
 */
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, In, Repository } from 'typeorm';
import { AccountStatus, OrderStatus, ShopStatus, TripStatus } from '../common/enums';
import { LedgerEntry } from '../earnings/ledger-entry.entity';
import { Favourite } from '../favourites/favourite.entity';
import { SavedPlace } from '../geo/place.entity';
import { Notification } from '../notifications/notification.entity';
import { Order } from '../orders/order.entity';
import { Product } from '../products/product.entity';
import { ShopRider } from '../shop-riders/shop-rider.entity';
import { Shop } from '../shops/shop.entity';
import { Trip } from '../trips/trip.entities';
import { DocumentsService } from '../uploads/documents.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Document } from '../uploads/document.entity';

const OPEN_ORDERS = [OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.READY, OrderStatus.ON_THE_WAY];
const OPEN_TRIPS = [TripStatus.SEARCHING, TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS];

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(LedgerEntry) private readonly ledger: Repository<LedgerEntry>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Favourite) private readonly favourites: Repository<Favourite>,
    @InjectRepository(SavedPlace) private readonly places: Repository<SavedPlace>,
    @InjectRepository(ShopRider) private readonly shopRiders: Repository<ShopRider>,
    @InjectRepository(Document) private readonly docs: Repository<Document>,
    @InjectDataSource() private readonly db: DataSource,
    private readonly usersService: UsersService,
    private readonly documents: DocumentsService,
  ) {}

  async export(userId: string) {
    const me = await this.usersService.getOrFail(userId);
    const myShops = await this.shops.find({ where: { ownerId: userId } });
    const [products, orders, courierJobs, trips, vehicles, ledger, notifications, favourites, places, docs] = await Promise.all([
      myShops.length ? this.products.find({ where: { shopId: In(myShops.map((s) => s.id)) } }) : [],
      this.orders.find({ where: { customerId: userId }, relations: { items: true }, order: { createdAt: 'DESC' }, take: 1000 }),
      this.orders.find({ where: { courierId: userId }, order: { createdAt: 'DESC' }, take: 1000 }),
      this.trips.find({ where: [{ customerId: userId }, { driverId: userId }], order: { requestedAt: 'DESC' }, take: 1000 }),
      this.vehicles.find({ where: { ownerId: userId } }),
      this.ledger.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 2000 }),
      this.notifications.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 200 }),
      this.favourites.find({ where: { userId } }),
      this.places.find({ where: { userId } }),
      this.docs.find({ where: { ownerId: userId } }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      note: 'This is the personal data ORBIT holds about you. Verification documents are listed but their files are not included.',
      profile: { ...(await this.usersService.toPublic(me)), termsAcceptedAt: me.termsAcceptedAt, termsVersion: me.termsVersion, joinedAt: me.createdAt, rating: { sum: me.ratingSum, count: me.ratingCount } },
      shops: myShops, products, orders, courierJobs, trips, vehicles, earningsLedger: ledger, notifications, favourites, savedPlaces: places,
      documents: docs.map((d) => ({ id: d.id, kind: d.kind, status: d.status, uploadedAt: d.createdAt })),
    };
  }

  async delete(userId: string, password: string): Promise<void> {
    const me = await this.usersService.getOrFail(userId);
    if (me.isSuperAdmin) throw new ForbiddenException('The superadmin account cannot be deleted from the app.');
    if (!(await bcrypt.compare(password, me.passwordHash))) throw new UnauthorizedException('That password is not right.');

    const myShops = await this.shops.find({ where: { ownerId: userId }, select: { id: true } });
    const shopIds = myShops.map((s) => s.id);
    const [openOrders, openTrips] = await Promise.all([
      this.orders.createQueryBuilder('o').where('o.status IN (:...s)', { s: OPEN_ORDERS })
        .andWhere(shopIds.length ? '(o.customerId = :u OR o.courierId = :u OR o.shopId IN (:...shops))' : '(o.customerId = :u OR o.courierId = :u)', { u: userId, shops: shopIds }).getCount(),
      this.trips.count({ where: [{ customerId: userId, status: In(OPEN_TRIPS) }, { driverId: userId, status: In(OPEN_TRIPS) }] }),
    ]);
    if (openOrders > 0) throw new ConflictException('You have an order in progress. Finish or cancel it before deleting your account.');
    if (openTrips > 0) throw new ConflictException('You have a trip in progress. Finish or cancel it before deleting your account.');

    await this.documents.erase(userId);
    await this.db.transaction(async (m) => {
      if (shopIds.length) {
        await m.update(Shop, { ownerId: userId }, { status: ShopStatus.SUSPENDED, isOpen: false, description: '', phone: '', logoUrl: null, coverUrl: null });
        await m.update(Product, { shopId: In(shopIds) }, { available: false });
        await m.delete(ShopRider, { shopId: In(shopIds) });
      }
      await m.delete(ShopRider, { riderId: userId });
      await m.delete(Favourite, { userId });
      await m.delete(SavedPlace, { userId });
      await m.delete(Notification, { userId });
      await m.delete(Vehicle, { ownerId: userId });
      await m.update(User, { id: userId }, {
        email: `deleted-${userId}@deleted.orbit`, phone: '', name: 'Deleted user', passwordHash: '!deleted', avatarUrl: null,
        status: AccountStatus.DELETED, online: false, lat: null, lng: null, heading: null, locationAt: null, vehicle: null,
        passwordChangedAt: new Date(), // every token this person holds stops working
      });
    });
  }
}
