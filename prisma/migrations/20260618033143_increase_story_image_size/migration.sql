-- CreateTable
CREATE TABLE `tai_khoan` (
    `idTAI_KHOAN` INTEGER NOT NULL AUTO_INCREMENT,
    `ten_tai_khoan` VARCHAR(45) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `mat_khau` VARCHAR(255) NOT NULL,
    `email_xac_thuc` BOOLEAN NULL DEFAULT false,
    `trang_thai` ENUM('active', 'locked', 'banned') NULL DEFAULT 'active',
    `last_login` DATETIME(0) NULL,
    `ip_dang_nhap_cuoi` VARCHAR(45) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_deleted` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `ten_tai_khoan`(`ten_tai_khoan`),
    UNIQUE INDEX `email`(`email`),
    INDEX `idx_email`(`email`),
    INDEX `idx_ten_tai_khoan`(`ten_tai_khoan`),
    PRIMARY KEY (`idTAI_KHOAN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vai_tro` (
    `idVAI_TRO` INTEGER NOT NULL AUTO_INCREMENT,
    `ten_vai_tro` VARCHAR(50) NOT NULL,
    `mo_ta` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`idVAI_TRO`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vai_tro_nguoi_dung` (
    `idVAI_TRO_NGUOI_DUNG` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idVAI_TRO` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    INDEX `idVAI_TRO`(`idVAI_TRO`),
    PRIMARY KEY (`idVAI_TRO_NGUOI_DUNG`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vi_tien` (
    `idTAI_KHOAN` INTEGER NOT NULL,
    `so_du_xu` INTEGER UNSIGNED NULL DEFAULT 0,
    `tong_nap_xu` INTEGER UNSIGNED NULL DEFAULT 0,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`idTAI_KHOAN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ho_so_ca_nhan` (
    `idHO_SO_CA_NHAN` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `ho_ten` VARCHAR(255) NOT NULL,
    `anh` VARCHAR(500) NULL,
    `mo_ta` TEXT NULL,
    `ngay_sinh` DATE NULL,
    `gioi_tinh` ENUM('male', 'female', 'other') NULL,
    `so_dien_thoai` VARCHAR(20) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idHO_SO_CA_NHAN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `truyen` (
    `idTRUYEN` INTEGER NOT NULL AUTO_INCREMENT,
    `ten_truyen` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(300) NOT NULL,
    `anh_bia` LONGTEXT NOT NULL,
    `anh_thumbnail` LONGTEXT NULL,
    `mo_ta` MEDIUMTEXT NULL,
    `trang_thai` ENUM('dang_tien_hanh', 'hoan_thanh', 'tam_dung', 'sap_ra_mat') NULL DEFAULT 'dang_tien_hanh',
    `tuoi_khuyen_nghi` TINYINT UNSIGNED NULL DEFAULT 16,
    `nguon` ENUM('sang_tac', 'dich', 'convert') NULL DEFAULT 'dich',
    `luot_xem` INTEGER UNSIGNED NULL DEFAULT 0,
    `luot_theo_doi` INTEGER UNSIGNED NULL DEFAULT 0,
    `diem_danh_gia_trung_binh` DECIMAL(3, 2) NULL DEFAULT 0.00,
    `so_luot_danh_gia` INTEGER UNSIGNED NULL DEFAULT 0,
    `so_chuong` INTEGER UNSIGNED NULL DEFAULT 0,
    `tag` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_deleted` BOOLEAN NULL DEFAULT false,

    UNIQUE INDEX `slug`(`slug`),
    INDEX `idx_slug`(`slug`),
    INDEX `idx_trang_thai`(`trang_thai`),
    PRIMARY KEY (`idTRUYEN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chuong` (
    `idCHUONG` INTEGER NOT NULL AUTO_INCREMENT,
    `idTRUYEN` INTEGER NOT NULL,
    `idQUYEN` INTEGER NULL,
    `chuong_so` DECIMAL(7, 1) NOT NULL,
    `tieu_de_chuong` VARCHAR(300) NOT NULL,
    `slug` VARCHAR(300) NOT NULL,
    `is_free` BOOLEAN NULL DEFAULT true,
    `gia_xu` INTEGER UNSIGNED NULL DEFAULT 0,
    `luot_xem` INTEGER UNSIGNED NULL DEFAULT 0,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_deleted` BOOLEAN NULL DEFAULT false,

    INDEX `idQUYEN`(`idQUYEN`),
    INDEX `idx_chuong_truyen`(`idTRUYEN`, `chuong_so`),
    PRIMARY KEY (`idCHUONG`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `noi_dung_chuong` (
    `idNOI_DUNG_CHUONG` INTEGER NOT NULL AUTO_INCREMENT,
    `idCHUONG` INTEGER NOT NULL,
    `noi_dung` LONGTEXT NULL,
    `duong_dan_file` VARCHAR(500) NULL,
    `content_type` ENUM('db', 'file') NULL DEFAULT 'db',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `idCHUONG`(`idCHUONG`),
    PRIMARY KEY (`idNOI_DUNG_CHUONG`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chuong_da_mua` (
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idCHUONG` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idCHUONG`(`idCHUONG`),
    PRIMARY KEY (`idTAI_KHOAN`, `idCHUONG`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `the_loai` (
    `idTHE_LOAI` INTEGER NOT NULL AUTO_INCREMENT,
    `ten_the_loai` VARCHAR(100) NOT NULL,
    `mo_ta` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`idTHE_LOAI`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `truyen_the_loai` (
    `idTRUYEN` INTEGER NOT NULL,
    `idTHE_LOAI` INTEGER NOT NULL,

    INDEX `idTHE_LOAI`(`idTHE_LOAI`),
    PRIMARY KEY (`idTRUYEN`, `idTHE_LOAI`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tac_gia_dich` (
    `idTAC_GIA_DICH` INTEGER NOT NULL AUTO_INCREMENT,
    `ten` VARCHAR(200) NOT NULL,
    `loai` ENUM('tac_gia', 'dich_gia', 'both') NOT NULL,
    `anh_dai_dien` VARCHAR(500) NULL,
    `mo_ta` TEXT NULL,
    `facebook` VARCHAR(255) NULL,
    `website` VARCHAR(255) NULL,
    `quoc_gia` VARCHAR(100) NULL DEFAULT 'Việt Nam',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`idTAC_GIA_DICH`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `theo_doi_truyen` (
    `idTHEO_DOI_TRUYEN` INTEGER NOT NULL AUTO_INCREMENT,
    `idTRUYEN` INTEGER NOT NULL,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `thong_bao_chuong_moi` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTRUYEN`(`idTRUYEN`),
    UNIQUE INDEX `uk_theo_doi`(`idTAI_KHOAN`, `idTRUYEN`),
    PRIMARY KEY (`idTHEO_DOI_TRUYEN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `binh_luan` (
    `idBINH_LUAN` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idTRUYEN` INTEGER NOT NULL,
    `idCHUONG` INTEGER NULL,
    `id_binh_luan_cha` INTEGER NULL,
    `noi_dung` VARCHAR(1000) NOT NULL,
    `like_count` INTEGER UNSIGNED NULL DEFAULT 0,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_deleted` BOOLEAN NULL DEFAULT false,

    INDEX `idCHUONG`(`idCHUONG`),
    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    INDEX `idTRUYEN`(`idTRUYEN`),
    PRIMARY KEY (`idBINH_LUAN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `like_binh_luan` (
    `idLIKE` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idBINH_LUAN` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idBINH_LUAN`(`idBINH_LUAN`),
    UNIQUE INDEX `uk_like`(`idTAI_KHOAN`, `idBINH_LUAN`),
    PRIMARY KEY (`idLIKE`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `danh_gia_truyen` (
    `idDANH_GIA` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idTRUYEN` INTEGER NOT NULL,
    `so_sao` TINYINT UNSIGNED NOT NULL,
    `noi_dung` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_deleted` BOOLEAN NULL DEFAULT false,

    INDEX `idTRUYEN`(`idTRUYEN`),
    UNIQUE INDEX `uk_danhgia`(`idTAI_KHOAN`, `idTRUYEN`),
    PRIMARY KEY (`idDANH_GIA`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_vi_pham` (
    `idREPORT` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `loai_doi_tuong` ENUM('truyen', 'chuong', 'binhluan') NOT NULL,
    `id_doi_tuong` INTEGER NOT NULL,
    `ly_do` TEXT NOT NULL,
    `trang_thai` ENUM('pending', 'approved', 'rejected') NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idREPORT`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tien_do_doc` (
    `idTIEN_DO_DOC` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idCHUONG` INTEGER NOT NULL,
    `vi_tri_doc` INTEGER UNSIGNED NULL DEFAULT 0,
    `phan_tram_doc` DECIMAL(5, 2) NULL DEFAULT 0.00,
    `ngay_doc_cuoi` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idCHUONG`(`idCHUONG`),
    UNIQUE INDEX `uk_tiendo`(`idTAI_KHOAN`, `idCHUONG`),
    PRIMARY KEY (`idTIEN_DO_DOC`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lich_su_doc` (
    `idLICH_SU_DOC` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idTRUYEN` INTEGER NOT NULL,
    `idCHUONG` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idCHUONG`(`idCHUONG`),
    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    INDEX `idTRUYEN`(`idTRUYEN`),
    PRIMARY KEY (`idLICH_SU_DOC`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hoa_don_nap` (
    `idHOA_DON_NAP` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `ma_giao_dich` VARCHAR(100) NULL,
    `so_xu_nap` INTEGER UNSIGNED NOT NULL,
    `so_tien_vnd` DECIMAL(12, 0) NOT NULL,
    `trang_thai` ENUM('pending', 'success', 'failed', 'cancelled') NULL DEFAULT 'pending',
    `phuong_thuc` ENUM('momo', 'vnpay', 'bank', 'khuyen_mai') NOT NULL,
    `ghi_chu` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ngay_xac_nhan` DATETIME(0) NULL,

    UNIQUE INDEX `ma_giao_dich`(`ma_giao_dich`),
    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idHOA_DON_NAP`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lich_su_giao_dich` (
    `idLICH_SU_GIAO_DICH` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `loai` ENUM('nap_xu', 'mua_chuong', 'donate', 'hoan_xu', 'khuyen_mai', 'rut_tien') NOT NULL,
    `id_doi_tuong` INTEGER NULL,
    `so_xu_thay_doi` INTEGER NOT NULL,
    `so_du_truoc` INTEGER UNSIGNED NOT NULL,
    `so_du_sau` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idLICH_SU_GIAO_DICH`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tang_thuong` (
    `idTANG_THUONG` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `loai` ENUM('dang_ky', 'doc_du_chuong', 'moi_ban_be', 'su_kien') NOT NULL,
    `so_xu` INTEGER UNSIGNED NOT NULL,
    `mo_ta` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idTANG_THUONG`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `khuyen_mai` (
    `idKHUYEN_MAI` INTEGER NOT NULL AUTO_INCREMENT,
    `ten_khuyen_mai` VARCHAR(200) NOT NULL,
    `ma_code` VARCHAR(50) NULL,
    `loai` ENUM('tang_xu', 'giam_gia_chuong', 'giam_gia_nap') NOT NULL,
    `gia_tri` DECIMAL(12, 2) NOT NULL,
    `ngay_bat_dau` DATETIME(0) NOT NULL,
    `ngay_ket_thuc` DATETIME(0) NOT NULL,
    `so_luong_su_dung` INTEGER UNSIGNED NULL DEFAULT 0,
    `gioi_han_su_dung` INTEGER UNSIGNED NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `ma_code`(`ma_code`),
    PRIMARY KEY (`idKHUYEN_MAI`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `su_dung_khuyen_mai` (
    `idSU_DUNG` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `idKHUYEN_MAI` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idKHUYEN_MAI`(`idKHUYEN_MAI`),
    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idSU_DUNG`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thong_bao` (
    `idTHONG_BAO` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `tieu_de` VARCHAR(200) NOT NULL,
    `noi_dung` TEXT NOT NULL,
    `loai` ENUM('chuong_moi', 'reply', 'khuyen_mai', 'rut_tien', 'tang_xu') NULL,
    `id_doi_tuong` INTEGER NULL,
    `da_doc` BOOLEAN NULL DEFAULT false,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idTHONG_BAO`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quyen` (
    `idQUYEN` INTEGER NOT NULL AUTO_INCREMENT,
    `idTRUYEN` INTEGER NOT NULL,
    `ten_quyen` VARCHAR(255) NOT NULL,
    `so_thu_tu` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idTRUYEN`(`idTRUYEN`),
    PRIMARY KEY (`idQUYEN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cai_dat_he_thong` (
    `khoa` VARCHAR(100) NOT NULL,
    `gia_tri` TEXT NOT NULL,
    `mo_ta` VARCHAR(255) NULL,

    PRIMARY KEY (`khoa`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `truyen_tac_gia_dich` (
    `idTRUYEN` INTEGER NOT NULL,
    `idTAC_GIA_DICH` INTEGER NOT NULL,
    `vai_tro` ENUM('tac_gia_chinh', 'tac_gia_phu', 'dich_gia_chinh', 'dich_gia_phu') NOT NULL,

    INDEX `idTAC_GIA_DICH`(`idTAC_GIA_DICH`),
    PRIMARY KEY (`idTRUYEN`, `idTAC_GIA_DICH`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yeuc_cau_rut_tien` (
    `idRUT_TIEN` INTEGER NOT NULL AUTO_INCREMENT,
    `idTAI_KHOAN` INTEGER NOT NULL,
    `so_tien_vnd` DECIMAL(12, 0) NOT NULL,
    `so_xu` INTEGER UNSIGNED NOT NULL,
    `tai_khoan_ngan_hang` VARCHAR(255) NOT NULL,
    `ten_ngan_hang` VARCHAR(100) NOT NULL,
    `trang_thai` ENUM('pending', 'approved', 'rejected', 'done') NULL DEFAULT 'pending',
    `ghi_chu` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ngay_xu_ly` DATETIME(0) NULL,

    INDEX `idTAI_KHOAN`(`idTAI_KHOAN`),
    PRIMARY KEY (`idRUT_TIEN`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vai_tro_nguoi_dung` ADD CONSTRAINT `vai_tro_nguoi_dung_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `vai_tro_nguoi_dung` ADD CONSTRAINT `vai_tro_nguoi_dung_ibfk_2` FOREIGN KEY (`idVAI_TRO`) REFERENCES `vai_tro`(`idVAI_TRO`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `vi_tien` ADD CONSTRAINT `vi_tien_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ho_so_ca_nhan` ADD CONSTRAINT `ho_so_ca_nhan_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `chuong` ADD CONSTRAINT `chuong_ibfk_1` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `chuong` ADD CONSTRAINT `chuong_ibfk_2` FOREIGN KEY (`idQUYEN`) REFERENCES `quyen`(`idQUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `noi_dung_chuong` ADD CONSTRAINT `noi_dung_chuong_ibfk_1` FOREIGN KEY (`idCHUONG`) REFERENCES `chuong`(`idCHUONG`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `chuong_da_mua` ADD CONSTRAINT `chuong_da_mua_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `chuong_da_mua` ADD CONSTRAINT `chuong_da_mua_ibfk_2` FOREIGN KEY (`idCHUONG`) REFERENCES `chuong`(`idCHUONG`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `truyen_the_loai` ADD CONSTRAINT `truyen_the_loai_ibfk_1` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `truyen_the_loai` ADD CONSTRAINT `truyen_the_loai_ibfk_2` FOREIGN KEY (`idTHE_LOAI`) REFERENCES `the_loai`(`idTHE_LOAI`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `theo_doi_truyen` ADD CONSTRAINT `theo_doi_truyen_ibfk_1` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `theo_doi_truyen` ADD CONSTRAINT `theo_doi_truyen_ibfk_2` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `binh_luan` ADD CONSTRAINT `binh_luan_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `binh_luan` ADD CONSTRAINT `binh_luan_ibfk_2` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `binh_luan` ADD CONSTRAINT `binh_luan_ibfk_3` FOREIGN KEY (`idCHUONG`) REFERENCES `chuong`(`idCHUONG`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `like_binh_luan` ADD CONSTRAINT `like_binh_luan_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `like_binh_luan` ADD CONSTRAINT `like_binh_luan_ibfk_2` FOREIGN KEY (`idBINH_LUAN`) REFERENCES `binh_luan`(`idBINH_LUAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `danh_gia_truyen` ADD CONSTRAINT `danh_gia_truyen_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `danh_gia_truyen` ADD CONSTRAINT `danh_gia_truyen_ibfk_2` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `report_vi_pham` ADD CONSTRAINT `report_vi_pham_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `tien_do_doc` ADD CONSTRAINT `tien_do_doc_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `tien_do_doc` ADD CONSTRAINT `tien_do_doc_ibfk_2` FOREIGN KEY (`idCHUONG`) REFERENCES `chuong`(`idCHUONG`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lich_su_doc` ADD CONSTRAINT `lich_su_doc_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lich_su_doc` ADD CONSTRAINT `lich_su_doc_ibfk_2` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lich_su_doc` ADD CONSTRAINT `lich_su_doc_ibfk_3` FOREIGN KEY (`idCHUONG`) REFERENCES `chuong`(`idCHUONG`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `hoa_don_nap` ADD CONSTRAINT `hoa_don_nap_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `lich_su_giao_dich` ADD CONSTRAINT `lich_su_giao_dich_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `tang_thuong` ADD CONSTRAINT `tang_thuong_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `su_dung_khuyen_mai` ADD CONSTRAINT `su_dung_khuyen_mai_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `su_dung_khuyen_mai` ADD CONSTRAINT `su_dung_khuyen_mai_ibfk_2` FOREIGN KEY (`idKHUYEN_MAI`) REFERENCES `khuyen_mai`(`idKHUYEN_MAI`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `thong_bao` ADD CONSTRAINT `thong_bao_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `quyen` ADD CONSTRAINT `quyen_ibfk_1` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `truyen_tac_gia_dich` ADD CONSTRAINT `truyen_tac_gia_dich_ibfk_1` FOREIGN KEY (`idTRUYEN`) REFERENCES `truyen`(`idTRUYEN`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `truyen_tac_gia_dich` ADD CONSTRAINT `truyen_tac_gia_dich_ibfk_2` FOREIGN KEY (`idTAC_GIA_DICH`) REFERENCES `tac_gia_dich`(`idTAC_GIA_DICH`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `yeuc_cau_rut_tien` ADD CONSTRAINT `yeuc_cau_rut_tien_ibfk_1` FOREIGN KEY (`idTAI_KHOAN`) REFERENCES `tai_khoan`(`idTAI_KHOAN`) ON DELETE NO ACTION ON UPDATE NO ACTION;
