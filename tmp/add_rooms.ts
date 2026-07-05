import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const classrooms = [
    "A344", "A348", "CSE 3F R&D Room 1", "CSE 3F R&D Room 2",
    "A244", "A241", "A243", "A245", "A124", "A126"
];

const labs = [
    "LAB1", "LAB2", "LAB3", "LAB4", "ADE LAB / MC LAB",
    "A121", "A123", "A122A", "A122B", "A123B"
];

async function addRooms() {
    try {
        // 1. Fetch existing rooms
        const { data: existingRooms, error: fetchError } = await supabase
            .from('rooms')
            .select('name');

        if (fetchError) throw fetchError;

        const existingNames = new Set(existingRooms?.map(r => r.name.toLowerCase().trim()));

        // 2. Prepare additions
        const toAdd = [];

        classrooms.forEach(name => {
            if (!existingNames.has(name.toLowerCase().trim())) {
                toAdd.push({ id: uuid(), name, type: 'classroom', capacity: 60 });
            }
        });

        labs.forEach(name => {
            if (!existingNames.has(name.toLowerCase().trim())) {
                toAdd.push({ id: uuid(), name, type: 'lab', capacity: 60 });
            }
        });

        if (toAdd.length === 0) {
            console.log('No new rooms to add.');
            return;
        }

        console.log(`Adding ${toAdd.length} rooms...`);

        // 3. Batch insert
        const { error: insertError } = await supabase
            .from('rooms')
            .insert(toAdd);

        if (insertError) throw insertError;

        console.log('Successfully added rooms.');
    } catch (err) {
        console.error('Failed to add rooms:', err);
    }
}

addRooms();
