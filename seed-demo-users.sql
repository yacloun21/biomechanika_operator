INSERT INTO users (
  full_name,
  study_group,
  photo_url,
  health_group,
  current_weight,
  current_height,
  current_health_index
)
VALUES
  ('Иванов Артём Сергеевич', 'ИС-21', '', 'Основная', 72.00, 180.00, 22.2),
  ('Петрова Мария Андреевна', 'БИО-12', '', 'Подготовительная', 58.00, 167.00, 20.8),
  ('Сидоров Кирилл Олегович', 'СП-04', '', 'Основная', 83.00, 176.00, 26.8)
ON CONFLICT DO NOTHING;

INSERT INTO user_measurements (user_id, weight, height, health_index, measured_at)
SELECT id, 70.00, 179.00, 21.8, NOW() - INTERVAL '20 days'
FROM users WHERE full_name = 'Иванов Артём Сергеевич'
UNION ALL
SELECT id, 72.00, 180.00, 22.2, NOW() - INTERVAL '2 days'
FROM users WHERE full_name = 'Иванов Артём Сергеевич'
UNION ALL
SELECT id, 57.00, 167.00, 20.4, NOW() - INTERVAL '14 days'
FROM users WHERE full_name = 'Петрова Мария Андреевна'
UNION ALL
SELECT id, 58.00, 167.00, 20.8, NOW() - INTERVAL '1 days'
FROM users WHERE full_name = 'Петрова Мария Андреевна'
UNION ALL
SELECT id, 81.00, 176.00, 26.1, NOW() - INTERVAL '10 days'
FROM users WHERE full_name = 'Сидоров Кирилл Олегович'
UNION ALL
SELECT id, 83.00, 176.00, 26.8, NOW() - INTERVAL '1 days'
FROM users WHERE full_name = 'Сидоров Кирилл Олегович';
