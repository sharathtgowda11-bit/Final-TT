const fs = require('fs');

let content = fs.readFileSync('src/scheduler.ts', 'utf-8');

const phase2Regex = /(\/\/\s*════════════════════════════════════════════════════════════\r?\n\s*\/\/\s*PHASE 2 — SCHEDULE ELECTIVES.*?)(?=\/\/\s*════════════════════════════════════════════════════════════\r?\n\s*\/\/\s*PHASE 3 — SCHEDULE LABS)/s;

const phase2Original = content.match(phase2Regex);
if (!phase2Original) {
    console.error("Phase 2 not found");
    process.exit(1);
}

const phase2a = `// ════════════════════════════════════════════════════════════
  // PHASE 2a — SCHEDULE FROZEN ELECTIVES
  // 4th sem: use frozen slot
  // All batches of a group run concurrently
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 2a: Scheduling frozen electives...');

  // Track which days each elective group has already been scheduled on
  const scheduledElectiveDays = new Map<string, Set<Day>>();
  for (const eg of appState.electiveGroups) {
    scheduledElectiveDays.set(eg.id, new Set<Day>());
  }

  for (const eg of appState.electiveGroups) {
    if (!eg.isFrozen || !eg.frozenDay || !eg.frozenPeriod) continue;

    const semSections = appState.sections.filter(s => s.semester === eg.semester);

    const chosenDay = eg.frozenDay;
    const chosenPeriod = eg.frozenPeriod;
    log_(\`  ✓ Elective "\${eg.name}" → frozen slot: \${chosenDay} \${chosenPeriod}\`);

    // Determine lab period
    const requiresLabSlot = eg.batches.some(b => b.hasLab);
    let labPeriod: Period | null = null;
    if (requiresLabSlot) {
      const pair = labPairsForDay(chosenDay).find(p => p[0] === chosenPeriod);
      if (pair) labPeriod = pair[1];
      else {
        const periodVals = Object.keys(PERIOD_ORDER) as Period[];
        const currIdx = PERIOD_ORDER[chosenPeriod];
        labPeriod = periodVals.find(p => PERIOD_ORDER[p] === currIdx + 1) || null;
      }
    }

    for (const batch of eg.batches) {
      grid.occupyFaculty(batch.facultyId, chosenDay, chosenPeriod, batch.subjectName);
      const theorySlot: TimetableSlot = {
        id: uuid(), day: chosenDay, period: chosenPeriod,
        subjectName: batch.subjectName, subjectType: 'elective',
        facultyId: batch.facultyId,
        facultyName: facultyMap.get(batch.facultyId)?.name || batch.facultyId,
        sectionId: semSections[0]?.id || 'elective',
        sectionName: \`Sem \${eg.semester} All\`, semester: eg.semester,
        batchName: batch.name, electiveGroupId: eg.id,
      };
      slots.push(theorySlot);

      if (batch.hasLab && labPeriod) {
        const activeLabFac = batch.labFacultyId || batch.facultyId;
        grid.occupyFaculty(activeLabFac, chosenDay, labPeriod, \`\${batch.subjectName} Lab\`);
        if (batch.labRoomId) grid.occupyRoom(batch.labRoomId, chosenDay, labPeriod);
        const labSlot: TimetableSlot = {
          id: uuid(), day: chosenDay, period: labPeriod,
          subjectName: \`\${batch.subjectName} Lab\`, subjectType: 'lab',
          facultyId: activeLabFac,
          facultyName: facultyMap.get(activeLabFac)?.name || activeLabFac,
          sectionId: semSections[0]?.id || 'elective',
          sectionName: \`Sem \${eg.semester} All\`, semester: eg.semester,
          batchName: batch.name,
          roomId: batch.labRoomId,
          roomName: batch.labRoomId ? roomMap.get(batch.labRoomId)?.name : undefined,
          electiveGroupId: eg.id, isLabContinuation: true,
        };
        slots.push(labSlot);
      }
    }

    for (const sec of semSections) {
      grid.occupySection(sec.id, chosenDay, chosenPeriod);
      if (labPeriod) grid.occupySection(sec.id, chosenDay, labPeriod);
    }

    scheduledElectiveDays.get(eg.id)!.add(chosenDay);
    log_(\`  ✓ Scheduled \${eg.batches.length} elective batches concurrently at \${chosenDay} \${chosenPeriod} \${labPeriod ? \`(Labs at \${labPeriod})\` : ''}\`);
  }

  `;

content = content.replace(phase2Original[0], phase2a);

const phase4Regex = /(\/\/\s*════════════════════════════════════════════════════════════\r?\n\s*\/\/\s*PHASE 4 — SCHEDULE THEORY CLASSES)/s;

const phase4Original = content.match(phase4Regex);
if (!phase4Original) {
    console.error("Phase 4 not found");
    process.exit(1);
}

const phase3b = `// ════════════════════════════════════════════════════════════
  // PHASE 3b — SCHEDULE NON-FROZEN ELECTIVES
  // 6th sem: algorithm picks slot
  // All batches of a group run concurrently
  // Supports classesPerWeek: each session on a DIFFERENT day
  // ════════════════════════════════════════════════════════════
  log_('▶ Phase 3b: Scheduling core electives...');

  for (const eg of appState.electiveGroups) {
    if (eg.isFrozen) continue;

    const semSections = appState.sections.filter(s => s.semester === eg.semester);
    const sessions = eg.classesPerWeek || 1;

    let session = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 30;

    while (session < sessions && attempts < MAX_ATTEMPTS) {
      attempts++;

      let chosenDay: Day = 'Thursday';
      let chosenPeriod: Period = 'P4';
      let found = false;

      const requiresLab = eg.batches.some(b => b.hasLab);

      if (requiresLab) {
        // Needs 2 continuous periods
        outerLoopLab:
        for (const d of DAYS) {
          if (d === 'Saturday') continue; // electives not on Saturday
          // HARD CONSTRAINT: only one session per day per elective group
          if (scheduledElectiveDays.get(eg.id)!.has(d)) continue;
          const pairs = labPairsForDay(d);
          for (const [p1, p2] of pairs) {
            // Check all elective faculty are free for theory slot (p1)
            const allTheoryFree = eg.batches.every(b => grid.isFacultyFree(b.facultyId, d, p1, b.subjectName));
            // Check all elective lab faculty and rooms are free for lab slot (p2)
            const allLabFree = eg.batches.every(b =>
              (!b.hasLab) ||
              (grid.isFacultyFree(b.labFacultyId || b.facultyId, d, p2, \`\${b.subjectName} Lab\`) && (!b.labRoomId || grid.isRoomFree(b.labRoomId, d, p2)))
            );
            // Check all semester sections are free for both periods
            const allSecFree = semSections.every(s => grid.isSectionFree(s.id, d, p1) && grid.isSectionFree(s.id, d, p2));

            if (allTheoryFree && allLabFree && allSecFree) {
              chosenDay = d;
              chosenPeriod = p1;
              found = true;
              break outerLoopLab;
            }
          }
        }
      } else {
        // Only theory
        outerLoop:
        for (const d of DAYS) {
          if (d === 'Saturday') continue; // electives not on Saturday
          // HARD CONSTRAINT: only one session per day per elective group
          if (scheduledElectiveDays.get(eg.id)!.has(d)) continue;
          const periods = periodsForDay(d);
          for (const p of periods) {
            if (isMorning(p)) continue; // electives prefer mid-day+
            // Check all elective faculty are free
            const allFacFree = eg.batches.every(b => grid.isFacultyFree(b.facultyId, d, p, b.subjectName));
            // Check all semester sections are free
            const allSecFree = semSections.every(s => grid.isSectionFree(s.id, d, p));
            if (allFacFree && allSecFree) {
              chosenDay = d;
              chosenPeriod = p;
              found = true;
              break outerLoop;
            }
          }
        }
      }

      if (!found) {
        log_(\`  ⚠ Could not schedule all sessions for elective "\${eg.name}" (\${session}/\${sessions} placed)\`);
        break; // no free day available, stop trying
      }

      // EXTRA SAFETY: check slots array for duplicate
      const alreadyExists = slots.some(s =>
        s.electiveGroupId === eg.id &&
        s.day === chosenDay &&
        s.subjectType === 'elective'
      );
      if (alreadyExists) continue; // skip, try again (attempts counter already incremented)

      log_(\`  ✓ Elective "\${eg.name}" session \${session + 1}/\${sessions} → algorithm chose: \${chosenDay} \${chosenPeriod}\`);

      // Determine lab period
      let labPeriod: Period | null = null;
      if (requiresLab) {
        const pair = labPairsForDay(chosenDay).find(p => p[0] === chosenPeriod);
        if (pair) labPeriod = pair[1];
        else {
          const periodVals = Object.keys(PERIOD_ORDER) as Period[];
          const currIdx = PERIOD_ORDER[chosenPeriod];
          labPeriod = periodVals.find(p => PERIOD_ORDER[p] === currIdx + 1) || null;
        }
      }

      // Schedule each batch in the chosen slot
      for (const batch of eg.batches) {
        // ── 1. Theory Slot ──
        grid.occupyFaculty(batch.facultyId, chosenDay, chosenPeriod, batch.subjectName);

        const theorySlot: TimetableSlot = {
          id: uuid(), day: chosenDay, period: chosenPeriod,
          subjectName: batch.subjectName, subjectType: 'elective',
          facultyId: batch.facultyId,
          facultyName: facultyMap.get(batch.facultyId)?.name || batch.facultyId,
          sectionId: semSections[0]?.id || 'elective',
          sectionName: \`Sem \${eg.semester} All\`, semester: eg.semester,
          batchName: batch.name, electiveGroupId: eg.id,
        };
        slots.push(theorySlot);

        // ── 2. Add Optional Lab Slot ──
        if (batch.hasLab && labPeriod) {
          const activeLabFac = batch.labFacultyId || batch.facultyId;
          grid.occupyFaculty(activeLabFac, chosenDay, labPeriod, \`\${batch.subjectName} Lab\`);
          if (batch.labRoomId) grid.occupyRoom(batch.labRoomId, chosenDay, labPeriod);

          const labSlot: TimetableSlot = {
            id: uuid(), day: chosenDay, period: labPeriod,
            subjectName: \`\${batch.subjectName} Lab\`, subjectType: 'lab',
            facultyId: activeLabFac,
            facultyName: facultyMap.get(activeLabFac)?.name || activeLabFac,
            sectionId: semSections[0]?.id || 'elective',
            sectionName: \`Sem \${eg.semester} All\`, semester: eg.semester,
            batchName: batch.name,
            roomId: batch.labRoomId,
            roomName: batch.labRoomId ? roomMap.get(batch.labRoomId)?.name : undefined,
            electiveGroupId: eg.id, isLabContinuation: true,
          };
          slots.push(labSlot);
        }
      }

      // Block all semester sections at the chosen slots
      for (const sec of semSections) {
        grid.occupySection(sec.id, chosenDay, chosenPeriod);
        if (labPeriod) grid.occupySection(sec.id, chosenDay, labPeriod);
      }

      // Mark day used — only increment session on SUCCESS
      scheduledElectiveDays.get(eg.id)!.add(chosenDay);
      session++;

      log_(\`  ✓ Scheduled \${eg.batches.length} elective batches concurrently at \${chosenDay} \${chosenPeriod} \${labPeriod ? \`(Labs at \${labPeriod})\` : ''}\`);
    }

    if (session < sessions) {
      log_(\`  ⚠ Could not schedule all sessions for elective "\${eg.name}" — placed \${session}/\${sessions}\`);
    }
  }

  ` + phase4Original[0];

content = content.replace(phase4Original[0], phase3b);

fs.writeFileSync('src/scheduler.ts', content, 'utf-8');
console.log("Success");
