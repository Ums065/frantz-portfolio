<?php
declare(strict_types=1);
require __DIR__ . '/../api/env.php';
load_env(__DIR__ . '/../api/.env');
$dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', env('DB_HOST','127.0.0.1'), env('DB_PORT','3306'), env('DB_NAME','frantz_portfolio'), env('DB_CHARSET','utf8mb4'));
$pdo = new PDO($dsn, env('DB_USER','root'), env('DB_PASS',''), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec(
  'CREATE TABLE IF NOT EXISTS new_school_school_rank_snapshots (
     id INT AUTO_INCREMENT PRIMARY KEY,
     school_id INT NOT NULL,
     rank_position INT NOT NULL,
     student_count INT NOT NULL,
     snapshot_date DATE NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uniq_school_snapshot_date (school_id, snapshot_date),
     KEY idx_snapshot_date (snapshot_date),
     CONSTRAINT fk_school_rank_snapshot_school FOREIGN KEY (school_id) REFERENCES new_school_schools(id) ON DELETE CASCADE
   ) ENGINE=InnoDB'
);
echo "new_school_school_rank_snapshots ready\n";
