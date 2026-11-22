-- Remove duplicate rows before applying this migration in an existing database.
ALTER TABLE `vai_tro_nguoi_dung`
  ADD CONSTRAINT `uk_tai_khoan_vai_tro` UNIQUE (`idTAI_KHOAN`, `idVAI_TRO`);

ALTER TABLE `chuong`
  ADD CONSTRAINT `uk_chuong_so_truyen` UNIQUE (`idTRUYEN`, `chuong_so`),
  ADD CONSTRAINT `uk_chuong_slug_truyen` UNIQUE (`idTRUYEN`, `slug`);
