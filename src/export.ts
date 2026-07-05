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
// 8-9 | 9-10 | 10:00-10:30 (BREAK) | 10:30-11:30 | 11:30-12:30 | 12:30-2:00 (LUNCH) | 2:00-3:00 | 3:00-4:00 | 4:00-5:00
const TEMPLATE_COLUMNS = [
    { period: 'P1' as Period, label: '8-9' },
    { period: 'P2' as Period, label: '9-10' },
    { period: null, label: '10.00-\n10:30', isBreak: true },
    { period: 'P3' as Period, label: '10:30-11:30' },
    { period: 'P4' as Period, label: '11:30-12:30' },
    { period: null, label: '12:30-\n02:00', isLunch: true },
    { period: 'P5' as Period, label: '2.00-3.00' },
    { period: 'P6' as Period, label: '3.00-4.00' },
    { period: 'P7' as Period, label: '4.00-5.00' },
];

const DAY_SHORT: Record<Day, string> = {
    Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED',
    Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT',
};

interface ExportOptions {
    sectionName: string;
    semester: number;
    slots: TimetableSlot[];
    subjects: { name: string; code: string; facultyName: string }[];
}

// ─── Helper: build grid data ───────────────────────────────
function buildGridData(slots: TimetableSlot[]) {
    const getSlot = (day: Day, period: Period): TimetableSlot | undefined =>
        slots.find(s => s.day === day && s.period === period);

    const rows: string[][] = [];

    for (const day of DAYS) {
        const dayPeriods = day === 'Saturday' ? SATURDAY_PERIODS : WEEKDAY_PERIODS;
        const row: string[] = [DAY_SHORT[day]];

        for (const col of TEMPLATE_COLUMNS) {
            if (col.isBreak) {
                row.push('B\nR\nE\nA\nK');
                continue;
            }
            if (col.isLunch) {
                row.push('L\nU\nN\nC\nH');
                continue;
            }
            if (!col.period || !dayPeriods.includes(col.period)) {
                row.push('');
                continue;
            }
            const slot = getSlot(day, col.period);
            if (slot) {
                // Show subject name + faculty name + batch (if lab)
                let cellText = slot.subjectName;
                if (slot.isLabContinuation) {
                    cellText = `${slot.subjectName} (cont.)`;
                }
                if (slot.batchName) {
                    cellText += `\n[${slot.batchName}]`;
                }
                cellText += `\n${slot.facultyName}`;
                if (slot.roomName) {
                    cellText += `\n${slot.roomName}`;
                }
                row.push(cellText);
            } else {
                row.push('');
            }
        }

        rows.push(row);
    }

    return rows;
}

// ─── Build subject legend ──────────────────────────────────
function buildLegend(subjects: ExportOptions['subjects']) {
    return subjects.map((s, i) => [String(i + 1), s.name, s.code, s.facultyName]);
}

// ════════════════════════════════════════════════════════════
// PDF EXPORT
// ════════════════════════════════════════════════════════════

export function exportToPDF(options: ExportOptions) {
    const { sectionName, semester, slots, subjects } = options;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // ── Header ──
    doc.setFontSize(13);
    doc.setTextColor(100, 50, 150); // Purple
    doc.text('Bapuji Institute of Engineering & Technology, Davangere-04', pageWidth / 2, 14, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(0, 100, 180); // Blue
    doc.text('Department of Computer Science & Engineering', pageWidth / 2, 21, { align: 'center' });

    doc.setFontSize(10);
    doc.text('EVEN semester Time Table for the Academic Year 2025-26', pageWidth / 2, 27, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Section: ${sectionName}  |  Semester: ${semester}`, pageWidth / 2, 34, { align: 'center' });

    // ── Timetable Grid ──
    const colHeaders = ['DAYS/TIME', ...TEMPLATE_COLUMNS.map(c => c.label)];
    const gridData = buildGridData(slots);

    autoTable(doc, {
        startY: 38,
        head: [colHeaders],
        body: gridData,
        theme: 'grid',
        tableWidth: 'auto',
        styles: {
            fontSize: 6.5,
            cellPadding: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
            halign: 'center',
            valign: 'middle',
            lineWidth: 0.3,
            lineColor: [80, 80, 80],
            overflow: 'linebreak',
            minCellWidth: 20,
        },
        headStyles: {
            fillColor: [240, 240, 255],
            textColor: [80, 40, 120],
            fontStyle: 'bold',
            fontSize: 6.5,
        },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: [240, 240, 255], textColor: [80, 40, 120], cellWidth: 18, minCellWidth: 18 },
            // Break column — narrow
            2: { fillColor: [255, 255, 240], textColor: [100, 100, 100], cellWidth: 12, minCellWidth: 12, fontSize: 5 },
            // Lunch column — narrow
            5: { fillColor: [255, 255, 240], textColor: [100, 100, 100], cellWidth: 12, minCellWidth: 12, fontSize: 5 },
        },
        didParseCell: function (data) {
            // Style break/lunch columns in body
            if (data.section === 'body' && (data.column.index === 2 || data.column.index === 5)) {
                data.cell.styles.fillColor = [255, 255, 240];
                data.cell.styles.textColor = [100, 100, 100];
                data.cell.styles.fontSize = 5;
            }
        },
    });

    // ── Subject Legend ──
    const legendY = (doc as any).lastAutoTable.finalY + 8;

    autoTable(doc, {
        startY: legendY,
        head: [['Sl. No.', 'Subject Name', 'Sub Code', 'Faculty In-Charge']],
        body: buildLegend(subjects),
        theme: 'grid',
        styles: {
            fontSize: 7,
            cellPadding: 1.5,
            lineWidth: 0.3,
            lineColor: [80, 80, 80],
        },
        headStyles: {
            fillColor: [240, 240, 255],
            textColor: [80, 40, 120],
            fontStyle: 'bold',
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            1: { cellWidth: 90 },
            2: { halign: 'center', cellWidth: 30 },
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

    // ── Build timetable sheet data ──
    const sheetData: (string | null)[][] = [];

    // Header rows
    sheetData.push(['Bapuji Institute of Engineering & Technology, Davangere-04']);
    sheetData.push(['Department of Computer Science & Engineering']);
    sheetData.push(['EVEN semester Time Table for the Academic Year 2025-26']);
    sheetData.push([`Section: ${sectionName}  |  Semester: ${semester}`]);
    sheetData.push([]); // blank row

    // Column headers
    const colHeaders = ['DAYS/TIME', ...TEMPLATE_COLUMNS.map(c => c.label.replace('\n', ' '))];
    sheetData.push(colHeaders);

    // Grid data
    const gridData = buildGridData(slots);
    for (const row of gridData) {
        // Replace vertical break/lunch text with horizontal
        const cleanRow = row.map(cell => cell.replace(/\n/g, ' '));
        sheetData.push(cleanRow);
    }

    // Blank rows before legend
    sheetData.push([]);
    sheetData.push([]);

    // Legend header
    sheetData.push(['Sl. No.', 'Subject Name', 'Sub Code', 'Faculty In-Charge']);

    // Legend data
    for (const legendRow of buildLegend(subjects)) {
        sheetData.push(legendRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // ── Column widths ──
    ws['!cols'] = [
        { wch: 14 },  // DAYS/TIME
        { wch: 24 },  // P1
        { wch: 24 },  // P2
        { wch: 10 },  // BREAK
        { wch: 24 },  // P3
        { wch: 24 },  // P4
        { wch: 10 },  // LUNCH
        { wch: 24 },  // P5
        { wch: 24 },  // P6
        { wch: 24 },  // P7
    ];

    // ── Merge header rows across all columns ──
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, // row 1
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }, // row 2
        { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } }, // row 3
        { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } }, // row 4
    ];

    XLSX.utils.book_append_sheet(wb, ws, `${sectionName} Sem${semester}`);
    XLSX.writeFile(wb, `Timetable_${sectionName}_Sem${semester}.xlsx`);
}
