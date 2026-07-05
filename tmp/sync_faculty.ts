import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { v4 as uuid } from 'uuid';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function syncFaculty() {
    try {
        const rawData = readFileSync('./parsed_even_sem.json', 'utf8');
        const data = JSON.parse(rawData);

        // Extract faculty names from Table 0 (index 0)
        const table0 = data.find((t: any) => t.table === 0);
        if (!table0) {
            console.error('Table 0 not found in JSON');
            return;
        }

        const facultyNames = new Set<string>();
        table0.rows.forEach((row: string[], index: number) => {
            // Skip headers and empty rows
            if (index === 0) return;
            const name = row[1]?.trim();
            if (name && name !== "Faculty Name" && name !== "Sign") {
                facultyNames.add(name);
            }
        });

        console.log(`Extracted ${facultyNames.size} faculty names from JSON.`);

        // Fetch existing faculty
        const { data: existingFaculty, error: fetchError } = await supabase
            .from('faculty')
            .select('name');

        if (fetchError) throw fetchError;

        const existingNames = new Set(existingFaculty?.map(f => f.name.toLowerCase().trim()));

        const toAdd = Array.from(facultyNames).filter(name => !existingNames.has(name.toLowerCase().trim()));

        console.log(`Adding ${toAdd.length} new faculty members...`);

        for (const name of toAdd) {
            const { error: insertError } = await supabase
                .from('faculty')
                .insert({
                    id: uuid(),
                    name: name,
                    department: 'CSE',
                    max_hours_per_week: 18
                });

            if (insertError) {
                console.error(`Error adding ${name}:`, insertError);
            } else {
                console.log(`Added: ${name}`);
            }
        }

        console.log('Sync complete.');
    } catch (err) {
        console.error('Sync failed:', err);
    }
}

syncFaculty();
