import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function removeDuplicates() {
    try {
        const { data: faculty, error: fetchError } = await supabase
            .from('faculty')
            .select('*');

        if (fetchError) throw fetchError;

        const groups = new Map<string, any[]>();
        faculty?.forEach(f => {
            const name = f.name.toLowerCase().trim();
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name)!.push(f);
        });

        for (const [name, facs] of groups) {
            if (facs.length > 1) {
                console.log(`Found ${facs.length} duplicates for: ${facs[0].name}`);

                // Strategy: Keep 18 hours if exists, otherwise keep the first one
                let toKeep = facs.find(f => f.max_hours_per_week === 18) || facs[0];

                const toDeleteIds = facs
                    .filter(f => f.id !== toKeep.id)
                    .map(f => f.id);

                console.log(`Keeping ID: ${toKeep.id} (${toKeep.max_hours_per_week} hrs)`);
                console.log(`Deleting IDs: ${toDeleteIds.join(', ')}`);

                for (const id of toDeleteIds) {
                    const { error: deleteError } = await supabase
                        .from('faculty')
                        .delete()
                        .eq('id', id);

                    if (deleteError) {
                        console.error(`Error deleting ${id}:`, deleteError);
                    } else {
                        console.log(`Deleted: ${id}`);
                    }
                }
            }
        }

        console.log('Duplicate removal complete.');
    } catch (err) {
        console.error('Removal failed:', err);
    }
}

removeDuplicates();
