import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function finalVerify() {
    try {
        const { data: faculty, error: fetchError } = await supabase
            .from('faculty')
            .select('*');

        if (fetchError) throw fetchError;

        let allCorrect = true;
        faculty?.forEach(f => {
            if (f.department !== 'CSE' || f.max_hours_per_week !== 18) {
                console.error(`Incorrect data for ${f.name}: Dept=${f.department}, Hours=${f.max_hours_per_week}`);
                allCorrect = false;
            }
        });

        if (allCorrect) {
            console.log('Final Verification Passed: All faculty are in CSE department and have 18 working hours.');
        } else {
            console.log('Final Verification Failed: Some faculty have incorrect department or hours.');
        }
    } catch (err) {
        console.error('Final verification failed:', err);
    }
}

finalVerify();
