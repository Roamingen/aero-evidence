const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const FONT_PATH = (() => {
    const candidates = [
        // Linux - 文泉驿
        '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
        '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
        // Linux - Noto
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/noto-cjk/NotoSansCJKsc-Regular.otf',
        // Windows
        'C:\\Windows\\Fonts\\simhei.ttf',
        'C:\\Windows\\Fonts\\msyh.ttc',
    ];
    const fs = require('fs');
    return candidates.find((p) => fs.existsSync(p)) || null;
})();

const STATUS_LABELS = {
    draft: '草稿', submitted: '待审核', peer_checked: '已复核',
    rii_approved: '已RII批准', released: '已放行', rejected: '已驳回', revoked: '已撤回',
};
const ACTION_LABELS = {
    submit: '提交', technician_sign: '技术签名', reviewer_sign: '审核签名',
    rii_approve: 'RII批准', release: '放行', reject: '驳回', revoke: '撤回',
};
const ROLE_LABELS = {
    technician: '技术员', reviewer: '审核员', rii_inspector: 'RII检查员',
    release_authority: '放行人员', system_node: '系统节点',
};
const HASH_LABELS = {
    formHash: '表单数据', faultHash: '故障信息', partsHash: '部件信息',
    measurementsHash: '测量数据', replacementsHash: '更换记录', attachmentManifestHash: '附件清单',
};

function fmt(val) {
    if (!val) return '-';
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Asia/Shanghai',
    }).format(new Date(val)).replace(/\//g, '-');
}

function short(hash) {
    if (!hash || hash.length < 16) return hash || '-';
    return hash.slice(0, 10) + '...' + hash.slice(-8);
}

async function generateVerifyPdf(verifyResult, verifyUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // ── 字体 ──
            if (fs.existsSync(FONT_PATH)) {
                doc.registerFont('SC', FONT_PATH);
                doc.font('SC');
            }

            const W = doc.page.width - 100; // usable width
            const { recordSummary: s, hashComparisons, signatureChain, verified, verifiedAt } = verifyResult;

            // ── 页眉 ──
            doc.fontSize(18).text('民航检修记录存证报告', { align: 'center' });
            doc.fontSize(9).fillColor('#607087').text('Aero Evidence — 区块链防篡改验证报告', { align: 'center' });
            doc.moveDown(0.5);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').stroke();
            doc.moveDown(0.5);

            // ── 验证结论横幅 ──
            const bannerColor = verified ? '#f0fdf4' : '#fef2f2';
            const bannerBorder = verified ? '#86efac' : '#fca5a5';
            const bannerText = verified ? '验证通过 — 数据完整，未检测到篡改' : '检测到篡改 — 数据与链上记录不一致';
            const bannerTextColor = verified ? '#16a34a' : '#dc2626';
            const bannerY = doc.y;
            doc.rect(50, bannerY, W, 28).fillAndStroke(bannerColor, bannerBorder);
            doc.fillColor(bannerTextColor).fontSize(11)
                .text(bannerText, 58, bannerY + 8, { width: W - 16 });
            doc.moveDown(1.8);

            // ── 记录摘要 ──
            doc.fillColor('#10243b').fontSize(12).text('记录摘要', { underline: true });
            doc.moveDown(0.4);
            const fields = [
                ['飞机注册号', s.aircraftRegNo], ['机型', s.aircraftType || '-'],
                ['工卡号', s.jobCardNo], ['版本', `R${s.revision}`],
                ['ATA代码', s.ataCode || '-'], ['工作类型', s.workType],
                ['位置代码', s.locationCode || '-'], ['执行人', `${s.performerName || '-'} (${s.performerEmployeeNo})`],
                ['记录状态', STATUS_LABELS[s.status] || s.status],
                ['提交时间', fmt(s.submittedAt)], ['放行时间', fmt(s.releasedAt)],
                ['验证时间', fmt(verifiedAt)],
            ];
            doc.fontSize(9).fillColor('#374151');
            const colW = W / 2;
            fields.forEach(([label, value], i) => {
                const x = 50 + (i % 2) * colW;
                if (i % 2 === 0 && i > 0) doc.moveDown(0.15);
                const y = doc.y;
                doc.fillColor('#8899aa').text(`${label}：`, x, y, { width: colW * 0.38, continued: false });
                doc.fillColor('#10243b').text(String(value), x + colW * 0.38, y, { width: colW * 0.58 });
                if (i % 2 === 0) doc.moveUp(1);
            });
            doc.moveDown(1);

            // ── 链上记录ID ──
            doc.fillColor('#8899aa').fontSize(8).text('链上记录 ID：', 50, doc.y, { continued: true });
            doc.fillColor('#374151').font(fs.existsSync(FONT_PATH) ? 'SC' : 'Courier')
                .fontSize(7.5).text(s.recordId || '-', { lineBreak: true });
            doc.moveDown(0.8);

            // ── 哈希完整性比对 ──
            doc.fillColor('#10243b').fontSize(12).font(fs.existsSync(FONT_PATH) ? 'SC' : 'Helvetica')
                .text('哈希完整性比对', 50, doc.y, { underline: true });
            doc.moveDown(0.4);

            // 表头
            const colWidths = [80, 52, 160, 160];
            const headers = ['数据项', '状态', '链上哈希', '重算哈希'];
            let tableX = 50;
            const headerY = doc.y;
            doc.rect(tableX, headerY, W, 16).fill('#f9fafb');
            doc.fillColor('#607087').fontSize(8);
            headers.forEach((h, i) => {
                doc.text(h, tableX + 4, headerY + 4, { width: colWidths[i] - 4 });
                tableX += colWidths[i];
            });
            doc.moveDown(1.2);

            hashComparisons.forEach((h) => {
                const rowY = doc.y;
                if (!h.match) doc.rect(50, rowY, W, 15).fill('#fef2f2');
                doc.fillColor('#10243b').fontSize(8);
                let cx = 50;
                doc.text(HASH_LABELS[h.name] || h.name, cx + 4, rowY + 3, { width: colWidths[0] - 4 }); cx += colWidths[0];
                const tagColor = h.match ? '#16a34a' : '#dc2626';
                doc.fillColor(tagColor).text(h.match ? '一致' : '不一致', cx + 4, rowY + 3, { width: colWidths[1] - 4 }); cx += colWidths[1];
                doc.fillColor('#607087').fontSize(7)
                    .text(short(h.onChain), cx + 4, rowY + 3, { width: colWidths[2] - 4 }); cx += colWidths[2];
                doc.text(short(h.recomputed), cx + 4, rowY + 3, { width: colWidths[3] - 4 });
                doc.moveTo(50, rowY + 15).lineTo(545, rowY + 15).strokeColor('#f3f4f6').stroke();
                doc.moveDown(0.9);
            });
            doc.moveDown(0.5);

            // ── 签名链 ──
            doc.fillColor('#10243b').fontSize(12).font(fs.existsSync(FONT_PATH) ? 'SC' : 'Helvetica')
                .text(`签名链（共 ${signatureChain.length} 个签名）`, 50, doc.y, { underline: true });
            doc.moveDown(0.4);

            signatureChain.forEach((sig, i) => {
                const sigY = doc.y;
                doc.rect(50, sigY, W, 36).fillAndStroke('#f9fafb', '#e5e7eb');
                doc.fillColor('#10243b').fontSize(9)
                    .text(`${i + 1}.  ${ACTION_LABELS[sig.action] || sig.action}`, 58, sigY + 5);
                doc.fillColor('#607087').fontSize(8)
                    .text(`角色：${ROLE_LABELS[sig.signerRole] || sig.signerRole}　　工号：${sig.signerEmployeeNo}　　时间：${fmt(sig.signedAt)}`, 58, sigY + 18);
                const boundLabel = sig.addressBound ? `已绑定 ${sig.boundName || ''}(${sig.boundEmployeeNo || ''})` : '地址未绑定';
                doc.fillColor(sig.addressBound ? '#16a34a' : '#92400e').fontSize(7.5)
                    .text(`地址：${short(sig.signerAddress)}　${boundLabel}`, 58, sigY + 28);
                doc.moveDown(2.6);
            });

            // ── 二维码 + 页脚 ──
            doc.addPage();
            const pageW = doc.page.width;

            // 标题
            doc.fillColor('#10243b').fontSize(14)
                .text('扫码在线验证', 50, 60, { width: pageW - 100, align: 'center' });

            // 副标题
            doc.fillColor('#607087').fontSize(9)
                .text('扫描下方二维码，可在公开验证门户实时验证本记录的区块链存证状态。', 50, 85, { width: pageW - 100, align: 'center' });

            // 二维码图片（固定坐标）
            const qrSize = 180;
            const qrX = (pageW - qrSize) / 2;
            const qrY = 115;
            const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 300, margin: 2 });
            const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
            const qrBuf = Buffer.from(qrBase64, 'base64');
            doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });

            // URL 文字（二维码正下方，固定坐标）
            doc.fillColor('#374151').fontSize(8)
                .text(verifyUrl, 50, qrY + qrSize + 12, { width: pageW - 100, align: 'center' });

            // 分隔线
            const footerLineY = qrY + qrSize + 40;
            doc.moveTo(50, footerLineY).lineTo(pageW - 50, footerLineY).strokeColor('#e5e7eb').stroke();

            // 页脚文字
            doc.fillColor('#8899aa').fontSize(7.5)
                .text(`本报告由 Aero Evidence 系统自动生成　生成时间：${fmt(new Date().toISOString())}`, 50, footerLineY + 10, { width: pageW - 100, align: 'center' })
                .text('链上数据不可篡改，本报告仅作为辅助阅读材料，以链上记录为准。', 50, footerLineY + 24, { width: pageW - 100, align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateVerifyPdf };
