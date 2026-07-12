// ============================================================
// TIMETABLE EXPORT — PDF & Excel
// Matches college template: header, grid with break/lunch, subject legend
// ============================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
    DAYS, WEEKDAY_PERIODS, SATURDAY_PERIODS,
    type Day, type Period, type TimetableSlot,
} from './types';

// ─── Column structure matching the college template ────────
const TEMPLATE_COLUMNS = [
    { period: 'P1' as Period,  label: '8-9' },
    { period: 'P2' as Period,  label: '9-10' },
    { period: null,            label: '10.00-\n10:30',  isBreak: true },
    { period: 'P3' as Period,  label: '10:30-11:30' },
    { period: 'P4' as Period,  label: '11:30-12:30' },
    { period: null,            label: '12:30-\n02:00',  isLunch: true },
    { period: 'P5' as Period,  label: '2.00-3.00' },
    { period: 'P6' as Period,  label: '3.00-4.00' },
    { period: 'P7' as Period,  label: '4.00-5.00' },
];

// Column widths in mm — must sum to (pageWidth - left margin - right margin)
// A4 landscape = 297mm, margins 5+5 = 287mm usable
const COL_WIDTHS = [
    15,  // DAYS/TIME
    24,  // P1  8-9
    24,  // P2  9-10
    11,  // BREAK
    28,  // P3  10:30-11:30
    28,  // P4  11:30-12:30
    11,  // LUNCH
    46,  // P5  2-3
    46,  // P6  3-4
    46,  // P7  4-5   total = 279 (leaves 8mm padding buffer)
];

const DAY_SHORT: Record<Day, string> = {
    Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED',
    Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT',
};

export interface ExportOptions {
    sectionName: string;
    semester: number;
    slots: TimetableSlot[];
    subjects: { name: string; code: string; facultyName: string }[];
}

// ─── Build grid rows ───────────────────────────────────────
function buildGridData(slots: TimetableSlot[]): string[][] {
    const getSlot = (day: Day, period: Period) =>
        slots.find(s => s.day === day && s.period === period);

    return DAYS.map(day => {
        const dayPeriods = day === 'Saturday' ? SATURDAY_PERIODS : WEEKDAY_PERIODS;
        const row: string[] = [DAY_SHORT[day]];

        for (const col of TEMPLATE_COLUMNS) {
            if (col.isBreak) { row.push('B\nR\nE\nA\nK'); continue; }
            if (col.isLunch) { row.push('L\nU\nN\nC\nH'); continue; }
            if (!col.period || !dayPeriods.includes(col.period)) { row.push(''); continue; }

            const slot = getSlot(day, col.period);
            if (!slot) { row.push(''); continue; }

            const lines: string[] = [];
            if (slot.isLabContinuation) {
                lines.push(`${slot.subjectName} (cont.)`);
            } else {
                lines.push(slot.subjectName);
            }
            if (slot.batchName) lines.push(`[${slot.batchName}]`);
            lines.push(slot.facultyName);
            if (slot.roomName) lines.push(slot.roomName);
            row.push(lines.join('\n'));
        }

        return row;
    });
}

// ─── Subject legend rows ───────────────────────────────────
function buildLegend(subjects: ExportOptions['subjects']): string[][] {
    return subjects.map((s, i) => [String(i + 1), s.name, s.code, s.facultyName]);
}

// ════════════════════════════════════════════════════════════
// PDF EXPORT
// ════════════════════════════════════════════════════════════

export function exportToPDF(options: ExportOptions) {
    const { sectionName, semester, slots, subjects } = options;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();  // 297mm

    // ── Header ──────────────────────────────────────────────
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 40, 120);
    doc.text('Bapuji Institute of Engineering & Technology, Davangere-04', pageW / 2, 12, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(0, 90, 170);
    doc.text('Department of Computer Science & Engineering', pageW / 2, 19, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 90, 170);
    doc.text('EVEN semester Time Table for the Academic Year 2025-26', pageW / 2, 25, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`Section: ${sectionName}  |  Semester: ${semester}`, pageW / 2, 32, { align: 'center' });

    // ── Timetable Grid ──────────────────────────────────────
    const colHeaders = ['DAYS/TIME', ...TEMPLATE_COLUMNS.map(c => c.label)];
    const gridData = buildGridData(slots);

    // Build columnStyles from COL_WIDTHS
    const columnStyles: Record<number, object> = {};
    COL_WIDTHS.forEach((w, i) => {
        columnStyles[i] = { cellWidth: w };
    });
    // Override break / lunch columns
    columnStyles[0]  = { cellWidth: COL_WIDTHS[0], fontStyle: 'bold', fillColor: [230, 235, 255], textColor: [60, 30, 100] };
    columnStyles[3]  = { cellWidth: COL_WIDTHS[3],  fillColor: [255, 252, 235], textColor: [120, 100, 50], fontSize: 5 };
    columnStyles[6]  = { cellWidth: COL_WIDTHS[6],  fillColor: [255, 252, 235], textColor: [120, 100, 50], fontSize: 5 };

    autoTable(doc, {
        startY: 36,
        margin: { left: 5, right: 5 },
        head: [colHeaders],
        body: gridData,
        theme: 'grid',
        tableWidth: pageW - 10,
        styles: {
            fontSize: 6.8,
            cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 },
            halign: 'center',
            valign: 'middle',
            lineWidth: 0.25,
            lineColor: [100, 100, 100],
            overflow: 'linebreak',
            font: 'helvetica',
        },
        headStyles: {
            fillColor: [230, 235, 255],
            textColor: [60, 30, 100],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'center',
            valign: 'middle',
            lineWidth: 0.3,
        },
        columnStyles,
        didParseCell(data) {
            // Keep break/lunch columns narrow with special styling everywhere
            if (data.column.index === 3 || data.column.index === 6) {
                data.cell.styles.fillColor = [255, 252, 235];
                data.cell.styles.textColor = [120, 100, 50];
                data.cell.styles.fontSize = 5;
            }
            // Day column header
            if (data.section === 'head' && data.column.index === 0) {
                data.cell.styles.fillColor = [210, 215, 245];
            }
            // Lab continuation cells — lighter bg
            if (data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.includes('(cont.)')) {
                data.cell.styles.fillColor = [240, 248, 255];
            }
        },
        willDrawCell(data) {
            // Zebra rows for body (very light)
            if (data.section === 'body' && data.column.index !== 3 && data.column.index !== 6) {
                if (data.row.index % 2 === 1 && !data.cell.raw) {
                    data.cell.styles.fillColor = [250, 250, 255];
                }
            }
        },
    });

    // ── Subject Legend ──────────────────────────────────────
    const legendY = (doc as any).lastAutoTable.finalY + 6;

    autoTable(doc, {
        startY: legendY,
        margin: { left: 5, right: 5 },
        head: [['Sl. No.', 'Subject Name', 'Sub Code', 'Faculty In-Charge']],
        body: buildLegend(subjects),
        theme: 'grid',
        tableWidth: pageW - 10,
        styles: {
            fontSize: 7.5,
            cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
            lineWidth: 0.25,
            lineColor: [100, 100, 100],
            font: 'helvetica',
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: [230, 235, 255],
            textColor: [60, 30, 100],
            fontStyle: 'bold',
            halign: 'center',
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 18 },
            1: { cellWidth: 110, halign: 'left' },
            2: { halign: 'center', cellWidth: 35 },
            3: { halign: 'left' },
        },
    });

    doc.save(`Timetable_${sectionName}_Sem${semester}.pdf`);
}

// ════════════════════════════════════════════════════════════
// EXCEL EXPORT
// ════════════════════════════════════════════════════════════

export function exportToExcel(options: ExportOptions) {
    const { sectionName, semester, slots, subjects } = options;

    const wb = XLSX.utils.book_new();
    const sheetData: (string | null)[][] = [];

    sheetData.push(['Bapuji Institute of Engineering & Technology, Davangere-04']);
    sheetData.push(['Department of Computer Science & Engineering']);
    sheetData.push(['EVEN semester Time Table for the Academic Year 2025-26']);
    sheetData.push([`Section: ${sectionName}  |  Semester: ${semester}`]);
    sheetData.push([]);

    const colHeaders = ['DAYS/TIME', ...TEMPLATE_COLUMNS.map(c => c.label.replace('\n', ' '))];
    sheetData.push(colHeaders);

    for (const row of buildGridData(slots)) {
        sheetData.push(row.map(cell => cell.replace(/\n/g, ' ')));
    }

    sheetData.push([]);
    sheetData.push([]);
    sheetData.push(['Sl. No.', 'Subject Name', 'Sub Code', 'Faculty In-Charge']);
    for (const row of buildLegend(subjects)) sheetData.push(row);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
        { wch: 12 },
        { wch: 22 }, { wch: 22 },
        { wch: 9 },
        { wch: 26 }, { wch: 26 },
        { wch: 9 },
        { wch: 28 }, { wch: 28 }, { wch: 28 },
    ];
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
    ];

    XLSX.utils.book_append_sheet(wb, ws, `${sectionName} Sem${semester}`);
    XLSX.writeFile(wb, `Timetable_${sectionName}_Sem${semester}.xlsx`);
}
