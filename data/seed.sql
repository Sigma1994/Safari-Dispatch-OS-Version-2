INSERT OR IGNORE INTO circuits (
    code, name, park_or_reserve, authority_type, region, days, max_daily_drive_hours, lodge_nightly_usd,
    high_ea_citizen_adult_kes, high_ea_citizen_child_kes,
    high_ke_resident_adult_kes, high_ke_resident_child_kes,
    high_af_citizen_adult_usd, high_af_citizen_child_usd,
    high_non_res_adult_usd, high_non_res_child_usd,
    low_ea_citizen_adult_kes, low_ea_citizen_child_kes,
    low_ke_resident_adult_kes, low_ke_resident_child_kes,
    low_af_citizen_adult_usd, low_af_citizen_child_usd,
    low_non_res_adult_usd, low_non_res_child_usd
) VALUES
    (
        'CIR-MARA-3D', 'Maasai Mara Classic', 'Maasai Mara National Reserve', 'narok_reserve', 'Rift Valley', 3, 6.0, 145.0,
        3000, 500, 5000, 2000, 100, 50, 200, 50,
        1500, 300, 2500, 1000, 60, 30, 100, 50
    ),
    (
        'CIR-AMBO-4D', 'Amboseli Kilimanjaro Loop', 'Amboseli National Park', 'kws_park', 'Southern Kenya', 4, 6.5, 130.0,
        1500, 750, 2025, 1050, 45, 25, 90, 45,
        1500, 750, 2025, 1050, 45, 25, 90, 45
    ),
    (
        'CIR-TSAVO-3D', 'Tsavo East & West Expedition', 'Tsavo East & West Parks', 'kws_park', 'Coast / Tsavo', 3, 7.0, 115.0,
        1000, 500, 1350, 675, 40, 20, 80, 40,
        1000, 500, 1350, 675, 40, 20, 80, 40
    ),
    (
        'CIR-NAKURU-2D', 'Lake Nakuru Flamingo & Rift', 'Lake Nakuru National Park', 'kws_park', 'Central Rift', 2, 4.5, 120.0,
        1500, 750, 2025, 1050, 45, 25, 90, 45,
        1500, 750, 2025, 1050, 45, 25, 90, 45
    ),
    (
        'CIR-SAMB-4D', 'Samburu Ewaso Nyiro Safari', 'Samburu National Reserve', 'conservancy', 'Northern Kenya', 4, 6.5, 135.0,
        1500, 500, 2500, 1000, 50, 25, 80, 40,
        1200, 400, 2000, 800, 40, 20, 70, 35
    ),
    (
        'CIR-MARA-RIFT-6D', 'Grand Rift & Mara Marathon', 'Maasai Mara & Lake Nakuru', 'narok_reserve', 'Rift Valley', 6, 8.5, 150.0,
        3000, 500, 5000, 2000, 100, 50, 200, 50,
        1500, 300, 2500, 1000, 60, 30, 100, 50
    );

INSERT OR IGNORE INTO fleet (code, vehicle_type, max_pax, daily_rate_usd, tsv_licensed, status) VALUES
    ('LC-01', '4x4 Pop-Top Land Cruiser', 6, 235.0, 1, 'available'),
    ('LC-02', '4x4 Pop-Top Land Cruiser', 6, 235.0, 1, 'available'),
    ('LC-03', '4x4 Pop-Top Land Cruiser', 6, 235.0, 1, 'available'),
    ('LX-01', 'Extended 4x4 Cruiser', 7, 280.0, 1, 'available'),
    ('OV-01', 'Safari Tour Van', 8, 180.0, 1, 'available'),
    ('LC-04', '4x4 Pop-Top Land Cruiser', 6, 235.0, 0, 'maintenance');

INSERT OR IGNORE INTO guides (name, languages, tier, daily_rate_usd, status) VALUES
    ('Peter Kamau', 'EN,SW', 'senior', 95.0, 'available'),
    ('Amina Hassan', 'EN,SW', 'senior', 95.0, 'available'),
    ('Joseph Lekakeny', 'EN,SW,MAA', 'senior', 105.0, 'available'),
    ('Grace Wanjiku', 'EN,SW', 'standard', 70.0, 'available'),
    ('Samuel Ochieng', 'EN,SW', 'standard', 70.0, 'on_leave');

-- Seed an active booking on LC-01 + Peter Kamau from 2026-12-10 to 2026-12-13
INSERT OR IGNORE INTO bookings (
    id, idempotency_key, thread_id, customer_name, circuit_id, vehicle_codes_json, guide_id,
    start_date, end_date, adults, children, infants_under_5, residency_tier,
    discount_pct, quoted_total_usd, quoted_total_kes, status
) VALUES (
    1, 'seed-idem-001', 'seed-thread-001', 'Wanjiru & Associates',
    (SELECT id FROM circuits WHERE code = 'CIR-AMBO-4D'),
    '["LC-01"]',
    (SELECT id FROM guides WHERE name = 'Peter Kamau'),
    '2026-12-10', '2026-12-13', 4, 0, 0, 'non_resident',
    0.0, 4320.0, 559440.0, 'confirmed'
);

INSERT OR IGNORE INTO vehicle_allocations (
    id, booking_id, vehicle_id, start_date, end_date, assigned_pax, status
) VALUES (
    1, 1,
    (SELECT id FROM fleet WHERE code = 'LC-01'),
    '2026-12-10', '2026-12-13', 4, 'active'
);

INSERT OR IGNORE INTO booking_guides (
    id, booking_id, guide_id, start_date, end_date, status
) VALUES (
    1, 1,
    (SELECT id FROM guides WHERE name = 'Peter Kamau'),
    '2026-12-10', '2026-12-13', 'active'
);
