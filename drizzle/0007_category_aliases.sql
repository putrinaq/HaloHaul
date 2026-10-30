ALTER TABLE "categories" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;
-- Search words for the seeded categories (synonyms, Malay, Chinese), so the
-- order form's category search finds "kasut" or "鞋". Only fills categories
-- that have none, so words an admin has set are never overwritten.
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['shirt', 't-shirt', 'tee', 'blouse', 'hoodie', 'sweater', 'jacket', 'cardigan', 'baju', 'kemeja', '上衣', 'T恤', '卫衣']::text[] WHERE key = 'clothing_top' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['pants', 'trousers', 'jeans', 'skirt', 'shorts', 'leggings', 'seluar', 'kain', '裤子', '半身裙']::text[] WHERE key = 'clothing_bottom' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['gown', 'jubah', 'abaya', 'baju kurung', 'maxi', '连衣裙', '裙子']::text[] WHERE key = 'dress' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['bralette', 'lingerie', 'underwear', 'coli', 'baju dalam', '内衣', '文胸']::text[] WHERE key = 'bra' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['sneakers', 'trainers', 'heels', 'boots', 'sandals', 'slippers', 'kasut', 'selipar', '鞋', '运动鞋']::text[] WHERE key = 'shoes' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['jewellery', 'jewelry', 'cincin', '戒指']::text[] WHERE key = 'ring' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['spectacles', 'eyeglasses', 'specs', 'frames', 'cermin mata', 'spek', '眼镜']::text[] WHERE key = 'glasses_prescription' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['contacts', 'softlens', 'soft lens', 'colour lens', 'circle lens', 'kanta lekap', '美瞳', '隐形眼镜']::text[] WHERE key = 'contact_lens' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['makeup', 'make-up', 'skincare', 'lipstick', 'eyeshadow', 'foundation', 'solekan', '化妆品', '口红']::text[] WHERE key = 'cosmetics' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['gadget', 'earphones', 'headphones', 'earbuds', 'charger', 'keyboard', 'mouse', 'elektronik', '耳机', '数码']::text[] WHERE key = 'electronics' AND aliases = '{}';
--> statement-breakpoint
UPDATE categories SET aliases = ARRAY['misc', 'anything', 'lain-lain', '其他']::text[] WHERE key = 'other' AND aliases = '{}';
