/**
 * Demo data for development, testing and the course demonstration.
 *
 * IMPORTANT: everything here is fictional sample data for a pilot-style demo (shop names, prices, people).
 * No traction, sales or users are implied. It never loads in production and only runs on an empty database.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AccountStatus, Role, ShopStatus } from '../common/enums';
import { Product } from '../products/product.entity';
import { Shop } from '../shops/shop.entity';
import { User } from '../users/user.entity';

export const DEMO_PASSWORD = 'Orbit@2026';

/** Shown on the app's sign-in screen in demo mode so each role is one tap away. */
export const DEMO_ACCOUNTS = [
  { label: 'Customer', email: 'student@orbit.demo', role: Role.CUSTOMER },
  { label: 'Merchant: Mama Nkechi’s Kitchen', email: 'nkechi@orbit.demo', role: Role.MERCHANT },
  { label: 'Rider', email: 'rider1@orbit.demo', role: Role.RIDER },
  { label: 'ORBIT admin', email: 'admin@orbit.demo', role: Role.ADMIN },
];

interface SeedShop {
  owner: { name: string; email: string; phone: string };
  shop: {
    name: string; category: string; address: string; color: string; description: string;
    prepMinutes: number; offersDelivery: boolean; deliveryFee: number;
  };
  products: Array<[name: string, description: string, price: number, stock: number]>;
}

const SHOPS: SeedShop[] = [
  {
    owner: { name: 'Nkechi Okafor', email: 'nkechi@orbit.demo', phone: '08031230001' },
    shop: {
      name: 'Mama Nkechi’s Kitchen', category: 'Food', address: 'Stall 4, Main Gate Food Court',
      color: '#B4232A', description: 'Home-style rice, soups and swallow, cooked fresh through the day.',
      prepMinutes: 20, offersDelivery: true, deliveryFee: 400,
    },
    products: [
      ['Jollof rice and chicken', 'Party jollof, one piece of fried chicken', 2800, 30],
      ['Fried rice and plantain', 'With peppered gizzard', 2600, 25],
      ['Egusi soup and pounded yam', 'Assorted meat, one wrap', 3200, 15],
      ['Beans and plantain', 'Honey beans, ripe plantain', 1800, 20],
      ['Moi moi', 'Steamed bean pudding, with egg', 800, 40],
      ['Zobo drink, 500ml', 'Chilled hibiscus drink', 500, 50],
    ],
  },
  {
    owner: { name: 'Suleiman Danjuma', email: 'suleiman@orbit.demo', phone: '08031230002' },
    shop: {
      name: 'Gate 2 Suya Spot', category: 'Food', address: 'Opposite Gate 2, near the bus stop',
      color: '#F2B705', description: 'Charcoal suya grilled to order, with yaji and onions.',
      prepMinutes: 25, offersDelivery: false, deliveryFee: 0,
    },
    products: [
      ['Beef suya', 'One portion with yaji and onions', 2000, 40],
      ['Chicken suya', 'Half chicken, grilled', 3500, 12],
      ['Suya wrap', 'Beef suya in flatbread with cabbage', 1800, 25],
      ['Kilishi', 'Dried spiced beef, 100g', 1500, 20],
      ['Boli (roasted plantain)', 'With groundnut', 800, 30],
    ],
  },
  {
    owner: { name: 'Ibrahim Kano', email: 'ibrahim@orbit.demo', phone: '08031230003' },
    shop: {
      name: 'Kano Provisions', category: 'Groceries', address: 'Shop 12, Hostel Road Plaza',
      color: '#137547', description: 'Everyday provisions for hostel life: noodles, bread, eggs, drinks.',
      prepMinutes: 10, offersDelivery: true, deliveryFee: 300,
    },
    products: [
      ['Bottled water, 75cl', 'Pack of one', 300, 200],
      ['Indomie noodles (single)', 'Chicken flavour', 250, 150],
      ['Sliced bread (large)', 'Fresh daily', 1400, 40],
      ['Eggs (crate of 30)', 'Farm eggs', 4800, 10],
      ['Peak milk (tin)', '170g tin', 1200, 60],
      ['Milo sachet', '20g sachet', 200, 120],
    ],
  },
  {
    owner: { name: 'Olayinka Bello', email: 'olayinka@orbit.demo', phone: '08031230004' },
    shop: {
      name: 'Handy Print and Stationery', category: 'Stationery', address: 'Block C, Faculty Row',
      color: '#1F4FBF', description: 'Printing, photocopying, binding and school supplies.',
      prepMinutes: 15, offersDelivery: true, deliveryFee: 300,
    },
    products: [
      ['A4 printing (per page)', 'Black and white', 50, 1000],
      ['Photocopy (per page)', 'Black and white', 30, 1000],
      ['Spiral binding', 'Up to 150 pages', 700, 100],
      ['Biro pens (pack of 10)', 'Blue ink', 1000, 60],
      ['A4 notebook, 200 pages', 'Hard cover', 1200, 45],
      ['Scientific calculator', 'Casio fx-991', 6500, 8],
    ],
  },
  {
    owner: { name: 'Hauwa Garba', email: 'hauwa@orbit.demo', phone: '08031230005' },
    shop: {
      name: 'Fresh Fruit Corner', category: 'Groceries', address: 'Beside the Library roundabout',
      color: '#6B3FA0', description: 'Fruit by the piece or the basket, plus cold tigernut drink.',
      prepMinutes: 10, offersDelivery: false, deliveryFee: 0,
    },
    products: [
      ['Watermelon slices', 'Cold, 4 slices', 500, 40],
      ['Pineapple (whole)', 'Peeled on request', 1500, 15],
      ['Bananas (bunch)', 'About 6 pieces', 1200, 25],
      ['Oranges (6)', 'Sweet, juicy', 900, 30],
      ['Fruit salad cup', 'Mixed fruit', 1800, 20],
      ['Tigernut drink, 500ml', 'Cold, lightly sweet', 600, 35],
    ],
  },
  {
    owner: { name: 'Chinedu Eze', email: 'chinedu@orbit.demo', phone: '08031230006' },
    shop: {
      name: 'Tech Corner Accessories', category: 'Gadgets', address: 'Shop 3, Student Union Building',
      color: '#0F766E', description: 'Chargers, earphones, power banks and phone protection.',
      prepMinutes: 10, offersDelivery: true, deliveryFee: 400,
    },
    products: [
      ['USB-C phone charger', 'Fast charging cable and plug', 3500, 25],
      ['Wired earphones', 'With microphone', 2500, 30],
      ['Power bank, 10,000mAh', 'Dual USB output', 12500, 10],
      ['Phone case', 'Clear, most models', 2000, 40],
      ['USB flash drive, 32GB', 'USB 3.0', 5500, 18],
      ['Screen protector', 'Tempered glass', 1500, 50],
    ],
  },
];

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /** Seeds only an empty database. Returns true if data was written. */
  async run(): Promise<boolean> {
    if ((await this.users.count()) > 0) return false;
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const base = { passwordHash: hash, status: AccountStatus.ACTIVE, vehicle: null as string | null, online: false };
    await this.users.save([
      this.users.create({ ...base, name: 'ORBIT Admin', email: 'admin@orbit.demo', phone: '08031239999', role: Role.ADMIN }),
      this.users.create({ ...base, name: 'Zainab Musa', email: 'student@orbit.demo', phone: '08031230100', role: Role.CUSTOMER }),
      this.users.create({ ...base, name: 'Tunde Adeyemi', email: 'student2@orbit.demo', phone: '08031230101', role: Role.CUSTOMER }),
      this.users.create({ ...base, name: 'Abdul Rahman', email: 'rider1@orbit.demo', phone: '08031230201', role: Role.RIDER, vehicle: 'MOTORCYCLE', online: true }),
      this.users.create({ ...base, name: 'Emeka Obi', email: 'rider2@orbit.demo', phone: '08031230202', role: Role.RIDER, vehicle: 'KEKE', online: true }),
      // A rider waiting for verification, so the admin approval flow can be demonstrated.
      this.users.create({ ...base, name: 'Sani Lawal', email: 'rider3@orbit.demo', phone: '08031230203', role: Role.RIDER, vehicle: 'BICYCLE', status: AccountStatus.PENDING }),
    ]);

    for (const entry of SHOPS) {
      const owner = await this.users.save(
        this.users.create({ ...base, ...entry.owner, role: Role.MERCHANT }),
      );
      const shop = await this.shops.save(
        this.shops.create({ ...entry.shop, ownerId: owner.id, status: ShopStatus.APPROVED, isOpen: true }),
      );
      await this.products.save(
        entry.products.map(([name, description, price, stock]) =>
          this.products.create({ shopId: shop.id, name, description, price, stock, available: true }),
        ),
      );
    }

    // A merchant waiting for verification, so the admin approval flow can be demonstrated.
    const pendingOwner = await this.users.save(
      this.users.create({
        ...base, name: 'Maryam Suleiman', email: 'maryam@orbit.demo', phone: '08031230007',
        role: Role.MERCHANT, status: AccountStatus.PENDING,
      }),
    );
    await this.shops.save(
      this.shops.create({
        ownerId: pendingOwner.id, name: 'Maryam’s Bakery', category: 'Food',
        address: 'Behind the Sports Complex', description: 'Fresh bread, buns and meat pies.',
        color: '#8A5A2B', status: ShopStatus.PENDING, isOpen: false,
      }),
    );

    this.logger.log(`Seeded demo data. All demo accounts use the password "${DEMO_PASSWORD}".`);
    return true;
  }
}
