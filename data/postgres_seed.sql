-- Safari Dispatch OS — PostgreSQL Seed Data (Idempotent)

INSERT INTO circuits (
    id, code, name, park_or_reserve, authority_type, region, days, max_daily_drive_hours, lodge_nightly_usd,
    high_ea_citizen_adult_kes, high_ea_citizen_child_kes,
    high_ke_resident_adult_kes, high_ke_resident_child_kes,
    high_af_citizen_adult_usd, high_af_citizen_child_usd,
    high_non_res_adult_usd, high_non_res_child_usd,
    low_ea_citizen_adult_kes, low_ea_citizen_child_kes,
    low_ke_resident_adult_kes, low_ke_resident_child_kes,
    low_af_citizen_adult_usd, low_af_citizen_child_usd,
    low_non_res_adult_usd, low_non_res_child_usd
) VALUES
    (1, 'CIR-MARA-3D', 'Maasai Mara Classic', 'Maasai Mara National Reserve', 'narok_reserve', 'South West', 3, 5.5, 145.0,
     3000, 500, 3000, 500, 200, 50, 200, 50,
     1500, 300, 1500, 300, 100, 50, 100, 50),
    (2, 'CIR-AMBO-4D', 'Amboseli Kilimanjaro Loop', 'Amboseli National Park', 'kws_park', 'Southern', 4, 6.0, 130.0,
     1500, 500, 2025, 750, 50, 20, 90, 35,
     1200, 400, 1500, 600, 40, 15, 70, 25),
    (3, 'CIR-TSAVO-5D', 'Tsavo East & West Expedition', 'Tsavo National Parks', 'kws_park', 'Coast Hinterland', 5, 7.0, 115.0,
     1200, 400, 1600, 600, 40, 15, 75, 25,
     1000, 350, 1300, 500, 35, 12, 60, 20),
    (4, 'CIR-NAKURU-2D', 'Lake Nakuru Flamingo & Rift', 'Lake Nakuru National Park', 'kws_park', 'Central Rift', 2, 4.5, 120.0,
     1500, 500, 2025, 750, 50, 20, 90, 35,
     1200, 400, 1500, 600, 40, 15, 70, 25),
    (5, 'CIR-SAMB-4D', 'Samburu Ewaso Nyiro Safari', 'Samburu National Reserve', 'conservancy', 'Northern', 4, 6.5, 150.0,
     1400, 500, 2000, 700, 55, 25, 85, 35,
     1100, 400, 1500, 550, 45, 20, 70, 25),
    (6, 'CIR-RIFT-8D', 'Grand Rift & Mara Marathon', 'Nakuru + Mara + Naivasha', 'narok_reserve', 'Multi-Region', 8, 8.5, 160.0,
     3000, 500, 3000, 500, 180, 50, 180, 50,
     1500, 300, 1500, 300, 100, 50, 100, 50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO fleet (id, code, vehicle_type, max_pax, daily_rate_usd, tsv_licensed, status) VALUES
    (1, 'LC-01', '4x4 Extended Land Cruiser (TSV)', 6, 235.0, 1, 'available'),
    (2, 'LC-02', '4x4 Extended Land Cruiser (TSV)', 6, 235.0, 1, 'available'),
    (3, 'LC-03', '4x4 Safari Land Cruiser (TSV)', 7, 250.0, 1, 'available'),
    (4, 'OV-01', 'Pop-Roof Tour Van (TSV)', 8, 175.0, 1, 'available'),
    (5, 'LC-04', '4x4 Extended Land Cruiser (TSV)', 6, 235.0, 1, 'maintenance')
ON CONFLICT (id) DO NOTHING;

INSERT INTO guides (id, name, languages, tier, daily_rate_usd, status) VALUES
    (1, 'Peter Kamau', 'English, Swahili, German', 'senior', 75.0, 'available'),
    (2, 'Amina Hassan', 'English, Swahili, French', 'senior', 75.0, 'available'),
    (3, 'Daniel Kiprop', 'English, Swahili', 'standard', 55.0, 'available'),
    (4, 'Grace Muthoni', 'English, Swahili, Spanish', 'senior', 75.0, 'on_leave')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bookings (
    id, idempotency_key, thread_id, customer_name, circuit_id, vehicle_codes_json, guide_id,
    start_date, end_date, adults, children, infants_under_5, residency_tier,
    discount_pct, quoted_total_usd, quoted_total_kes, status
) VALUES (
    1, 'seed-idem-001', 'seed-thread-001', 'Wanjiru & Associates', 2, '["LC-01"]', 1,
    '2026-12-10', '2026-12-13', 4, 0, 0, 'non_resident',
    0.0, 4320.0, 559440.0, 'confirmed'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO vehicle_allocations (id, booking_id, vehicle_id, start_date, end_date, assigned_pax, status) VALUES
    (1, 1, 1, '2026-12-10', '2026-12-13', 4, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO booking_guides (id, booking_id, guide_id, start_date, end_date, status) VALUES
    (1, 1, 1, '2026-12-10', '2026-12-13', 'active')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('circuits', 'id'), COALESCE((SELECT MAX(id) FROM circuits), 1), true);
SELECT setval(pg_get_serial_sequence('fleet', 'id'), COALESCE((SELECT MAX(id) FROM fleet), 1), true);
SELECT setval(pg_get_serial_sequence('guides', 'id'), COALESCE((SELECT MAX(id) FROM guides), 1), true);
SELECT setval(pg_get_serial_sequence('bookings', 'id'), COALESCE((SELECT MAX(id) FROM bookings), 1), true);
SELECT setval(pg_get_serial_sequence('vehicle_allocations', 'id'), COALESCE((SELECT MAX(id) FROM vehicle_allocations), 1), true);
SELECT setval(pg_get_serial_sequence('booking_guides', 'id'), COALESCE((SELECT MAX(id) FROM booking_guides), 1), true);
