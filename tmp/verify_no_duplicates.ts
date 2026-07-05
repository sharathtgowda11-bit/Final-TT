import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyNoDuplicates() {
    try {
        const { data: faculty, error: fetchError } = await supabase
            .from('faculty')
            .select('name');

        if (fetchError) throw fetchError;

        const names = new Set();
        const duplicates = [];

        faculty?.forEach(f => {
            const name = f.name.toLowerCase().trim();
            if (names.has(name)) {
                duplicates.push(name);
            }
            names.add(name);
        });

        if (duplicates.length === 0) {
            console.log('No duplicate faculty names found in Supabase.');
        } else {
            console.log('Duplicate faculty names still exist:', duplicates.join(', '));
        }
    } catch (err) {
        console.error('Verification failed:', err);
    }
}

verifyNoDuplicates();
