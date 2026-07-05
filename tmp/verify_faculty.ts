import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyFaculty() {
    try {
        const rawData = readFileSync('./parsed_even_sem.json', 'utf8');
        const data = JSON.parse(rawData);

        // Extract faculty names from Table 0 (index 0)
        const table0 = data.find((t: any) => t.table === 0);
        const facultyNames = new Set<string>();
        table0.rows.forEach((row: string[], index: number) => {
            if (index === 0) return;
            const name = row[1]?.trim();
            if (name && name !== "Faculty Name" && name !== "Sign") {
                facultyNames.add(name);
            }
        });

        // Fetch existing faculty
        const { data: existingFaculty, error: fetchError } = await supabase
            .from('faculty')
            .select('name, max_hours_per_week');

        if (fetchError) throw fetchError;

        const existingNamesMap = new Map(existingFaculty?.map(f => [f.name.toLowerCase().trim(), f.max_hours_per_week]));

        let allPresent = true;
        let mismatchedHours = [];

        for (const name of facultyNames) {
            const hours = existingNamesMap.get(name.toLowerCase().trim());
            if (hours === undefined) {
                console.error(`Missing: ${name}`);
                allPresent = false;
            } else if (hours !== 18 && name !== "Dr. Nirmala C.R." && !name.includes("Dr.")) {
                // Note: Existing faculty might have different hours (default was 20).
                // The user said "add rest of the faculty and keep working hours as 18 per faculty"
                // So new ones should be 18.
            }
        }

        if (allPresent) {
            console.log('All faculty members from JSON are present in Supabase.');
        } else {
            console.log('Some faculty members are missing.');
        }
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verifyFaculty();
