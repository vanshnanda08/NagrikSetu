-- Move the four demonstration wards to Patiala, centred around Thapar
-- Institute (approximately 30.355833 N, 76.365 E). These remain illustrative
-- sectors, not official municipal ward boundaries.
--
-- Keep ward IDs and officer assignments stable. Original report locations,
-- issue centroids and moderation evidence remain unchanged: a service-area
-- change must not invent new GPS coordinates for historical complaints.
-- Fresh seed runs generate their corpus around Thapar (see SeedDataGenerator).
-- Leave V2 untouched because existing installations validate its checksum.

UPDATE wards w
SET name = v.name,
    boundary = ST_Multi(ST_MakeEnvelope(v.west, v.south, v.east, v.north, 4326))
FROM (VALUES
    (1, 'Ward 1 - Thapar North West', 76.286, 30.356, 76.366, 30.416),
    (2, 'Ward 2 - Thapar North East', 76.366, 30.356, 76.446, 30.416),
    (3, 'Ward 3 - Thapar South West', 76.286, 30.296, 76.366, 30.356),
    (4, 'Ward 4 - Thapar South East', 76.366, 30.296, 76.446, 30.356)
) AS v(ward_number, name, west, south, east, north)
WHERE w.ward_number = v.ward_number;
