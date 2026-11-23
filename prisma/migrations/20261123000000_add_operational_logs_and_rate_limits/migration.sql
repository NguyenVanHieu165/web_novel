CREATE TABLE `nhat_ky_he_thong` (
  `idNHAT_KY` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `muc_do` VARCHAR(10) NOT NULL,
  `nguon` VARCHAR(80) NOT NULL,
  `ma_loi` VARCHAR(80) NULL,
  `thong_diep` VARCHAR(500) NOT NULL,
  `chi_tiet` TEXT NULL,
  `request_id` VARCHAR(36) NULL,
  `job_id` VARCHAR(36) NULL,
  `idTAI_KHOAN` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`idNHAT_KY`),
  INDEX `idx_nhat_ky_created_at` (`created_at`),
  INDEX `idx_nhat_ky_muc_do_created_at` (`muc_do`, `created_at`),
  INDEX `idx_nhat_ky_nguon_created_at` (`nguon`, `created_at`),
  INDEX `idx_nhat_ky_request_id` (`request_id`),
  INDEX `idx_nhat_ky_job_id` (`job_id`),
  INDEX `idx_nhat_ky_tai_khoan` (`idTAI_KHOAN`),
  CONSTRAINT `nhat_ky_he_thong_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`)
    REFERENCES `tai_khoan` (`idTAI_KHOAN`) ON DELETE SET NULL ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `gioi_han_tan_suat` (
  `khoa_bam` CHAR(64) NOT NULL,
  `so_lan` INT UNSIGNED NOT NULL DEFAULT 1,
  `het_han` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`khoa_bam`),
  INDEX `idx_gioi_han_tan_suat_het_han` (`het_han`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
