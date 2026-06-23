-- CDN без параметра иногда отдаёт миниатюру 199×300. Фиксируем оригинал 1100×1662.
UPDATE library_items
SET hd_cover_url = 'https://content.img-gorod.ru/pim/products/images/59/d2/018f5cad-318d-7e8d-9ee4-a24076a359d2.jpg?width=1200'
WHERE id = '0989677';

UPDATE library_items
SET hd_cover_url = 'https://content.img-gorod.ru/pim/products/images/a7/77/018f5cba-5aa5-7f44-a67e-ea0cb447a777.jpg?width=1200'
WHERE id = '0989674';
