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

async function updateAllFaculty() {
    try {
        // 1. Extract all names from JSON
        const rawData = readFileSync('./parsed_even_sem.json', 'utf8');
        const data = JSON.parse(rawData);
        const table0 = data.find((t: any) => t.table === 0);
        const jsonNames = new Set<string>();
        table0.rows.forEach((row: string[], index: number) => {
            if (index === 0) return;
            const name = row[1]?.trim();
            if (name && name !== "Faculty Name" && name !== "Sign") {
                jsonNames.add(name);
            }
        });

        // 2. Fetch all current faculty
        const { data: currentFaculty, error: fetchError } = await supabase
            .from('faculty')
            .select('*');

        if (fetchError) throw fetchError;

        // 3. Update all existing to CSE/18
        console.log(`Updating ${currentFaculty?.length} existing faculty to CSE/18...`);
        for (const f of currentFaculty || []) {
            if (f.department !== 'CSE' || f.max_hours_per_week !== 18) {
                const { error: updateError } = await supabase
                    .from('faculty')
                    .update({ department: 'CSE', max_hours_per_week: 18 })
                    .eq('id', f.id);
                if (updateError) console.error(`Error updating ${f.name}:`, updateError);
            }
        }

        // 4. Add missing names from JSON
        const existingNames = new Set(currentFaculty?.map(f => f.name.toLowerCase().trim()));
        const toAdd = Array.from(jsonNames).filter(name => !existingNames.has(name.toLowerCase().trim()));

        console.log(`Adding ${toAdd.length} missing faculty names...`);
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

        // 5. Cleanup duplicates (just in case)
        const { data: finalFaculty } = await supabase.from('faculty').select('*');
        const seen = new Map();
        for (const f of finalFaculty || []) {
            const lowerName = f.name.toLowerCase().trim();
            if (seen.has(lowerName)) {
                console.log(`Deleting duplicate: ${f.name} (${f.id})`);
                await supabase.from('faculty').delete().eq('id', f.id);
            } else {
                seen.set(lowerName, f.id);
            }
        }

        console.log('Update and sync complete.');
    } catch (err) {
        console.error('Update failed:', err);
    }
}

updateAllFaculty();
