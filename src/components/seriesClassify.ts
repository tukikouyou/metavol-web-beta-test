// シリーズが PET/CT fusion 解析に "primary" として使えるかを判定する。
//
// 判定基準 (すべて満たす必要あり):
//   - modality が CT / PT / MR (それ以外は OTHER または PR/SR/RTSTRUCT 等で除外)
//   - フレーム数が MIN_FRAMES_FOR_PRIMARY 以上 (1 枚 PR や localizer 単発を除外)
//   - (0008,0008) ImageType に "DERIVED" / "MIP" / "LOCALIZER" / "PROJECTION IMAGE" を含まない
//   - (0028,0004) PhotometricInterpretation が "RGB" / "PALETTE COLOR" でない
//
// NIfTI / 非 DICOM はモダリティ + nz で判定する (DataSet なし)。

const MIN_FRAMES_FOR_PRIMARY = 20;

export interface ClassifyParams {
    nFrames: number;          // DICOM: myDicom.length / NIfTI: volume.nz
    modality: string;         // 既に正規化された modality 文字列 ('CT' / 'PT' / 'MR' / etc)
    photometric?: string;     // (0028,0004), DICOM のみ
    imageType?: string;       // (0008,0008), DICOM のみ
}

export const isPrimaryForFusion = (p: ClassifyParams): boolean => {
    const m = (p.modality ?? '').toUpperCase();
    if (m !== 'CT' && m !== 'PT' && m !== 'PET' && m !== 'MR') return false;
    if (p.nFrames < MIN_FRAMES_FOR_PRIMARY) return false;

    const parts = (p.imageType ?? '').toUpperCase().split('\\');
    if (parts.includes('DERIVED')) return false;
    if (parts.includes('MIP')) return false;
    if (parts.includes('PROJECTION IMAGE')) return false; // 一部ベンダ MIP
    if (parts.includes('LOCALIZER')) return false;        // scout / topogram

    const photo = (p.photometric ?? '').toUpperCase();
    if (photo === 'RGB') return false;
    if (photo === 'PALETTE COLOR') return false;
    return true;
};

// RGB 系シリーズか (カード表示で警告するため)
export const isRgbSeries = (photometric?: string): boolean => {
    const p = (photometric ?? '').toUpperCase();
    return p === 'RGB' || p === 'PALETTE COLOR' || p === 'YBR_FULL' || p === 'YBR_FULL_422';
};
