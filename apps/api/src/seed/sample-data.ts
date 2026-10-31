import type { CareStatus, MeasurementMethod } from '@abapro/shared';
import { recordAudit } from '../common/audit';
import { recordChangeReason } from '../common/clinical-change';
import { asString } from '../common/http';
import type { Database, Queryable } from '../db/database';

/** Sample clients use this code prefix; an existing code is never overwritten. */
export const SAMPLE_CODE_PREFIX = 'SMP-';

interface SampleTask {
  title: string;
  sd: string;
  operationalDefinition: string;
  phase: 'baseline' | 'intervention' | 'maintenance' | 'mastered';
  status: CareStatus;
  masterySessions: number;
  masteryProbe: number;
  baselineSessions?: number;
  baselineProbe?: number;
  promptHierarchy: string;
}

interface SampleProgram {
  title: string;
  domain: string;
  assessmentType: string;
  status: CareStatus;
  measurement: { method: MeasurementMethod; procedure: 'Probe' | 'Step by Step'; trials: number };
  sd: string;
  objective: string;
  description: string;
  goal: string;
  masterySteps: string;
  teachingSteps: string;
  masteryCriteria: string;
  errorCorrection: string;
  teachingMethod: string;
  netTeachingIdea: string;
  tasks: SampleTask[];
}

interface SampleClient {
  code: string;
  displayName: string;
  /** Left empty so initials come from the full name (the app prefers the preferred name). */
  preferredName: string | null;
  dateOfBirth: string;
  language: string;
  programs: SampleProgram[];
}

const ERROR_CORRECTION =
  'Model the correct response, re-present the SD, provide a transfer trial with a less intrusive prompt, then present a distractor before a final independent check.';
const PROMPTS_MOST_TO_LEAST = 'Full physical → partial physical → model → gesture → independent';
const PROMPTS_LEAST_TO_MOST = 'Independent → gesture → verbal → model → partial physical';

function task(
  title: string,
  sd: string,
  operationalDefinition: string,
  status: CareStatus,
  options: { phase?: SampleTask['phase']; masterySessions?: number; masteryProbe?: number; prompts?: string } = {},
): SampleTask {
  const phase = options.phase ?? (status === 'mastered' ? 'mastered' : status === 'maintenance' ? 'maintenance' : 'intervention');
  return {
    title,
    sd,
    operationalDefinition,
    phase,
    status,
    masterySessions: options.masterySessions ?? 3,
    masteryProbe: options.masteryProbe ?? 90,
    baselineSessions: phase === 'baseline' ? 3 : undefined,
    baselineProbe: phase === 'baseline' ? 80 : undefined,
    promptHierarchy: options.prompts ?? PROMPTS_LEAST_TO_MOST,
  };
}

const PROGRAMS: Record<string, SampleProgram> = {
  mand: {
    title: 'Manding for preferred items',
    domain: 'Communication',
    assessmentType: 'VB-MAPP',
    status: 'in_treatment',
    measurement: { method: 'trial', procedure: 'Step by Step', trials: 10 },
    sd: 'Hold up a preferred item and wait 5 seconds with an expectant look.',
    objective: 'The learner independently requests preferred items using 1–2 word phrases.',
    description: 'Builds functional requesting across snacks, toys and activities in clinic and home settings.',
    goal: 'Request 10 different preferred items independently across two settings.',
    masterySteps: 'Step 1: echoic mand with model\nStep 2: mand with partial verbal prompt\nStep 3: independent single-word mand\nStep 4: independent two-word mand',
    teachingSteps: 'Contrive motivation with a preferred item in view. Wait 5 seconds. If no response, model the word and deliver the item on an approximation. Fade the model across sessions.',
    masteryCriteria: '90% independent responses across 3 consecutive sessions with 2 therapists.',
    errorCorrection: ERROR_CORRECTION,
    teachingMethod: 'Natural Environment Teaching (NET) with incidental teaching',
    netTeachingIdea: 'Place favourite snacks in clear containers out of reach during snack time.',
    tasks: [
      task('Mand “cookie”', 'Show cookie, wait with expectant look', 'Says “cookie” or close approximation within 5 seconds.', 'mastered'),
      task('Mand “bubbles”', 'Hold bubble wand, pause', 'Says “bubbles” before the bubbles are blown.', 'in_treatment'),
      task('Mand “more please”', 'Pause mid-activity', 'Says “more please” to continue a preferred activity.', 'in_treatment', { masteryProbe: 80 }),
      task('Mand for missing item', 'Give puzzle with one piece missing', 'Asks for the missing piece by name.', 'on_hold', { phase: 'baseline' }),
    ],
  },
  receptive: {
    title: 'Receptive identification of objects',
    domain: 'Receptive Language',
    assessmentType: 'ABLLS-R',
    status: 'in_treatment',
    measurement: { method: 'trial', procedure: 'Step by Step', trials: 10 },
    sd: '“Touch the [item].”',
    objective: 'The learner selects named common objects from an array of three.',
    description: 'Teaches listener responding to object names using a field of three with rotating distractors.',
    goal: 'Identify 20 common objects in a field of three with 90% accuracy.',
    masterySteps: 'Field of 1 → field of 2 → field of 3 with known distractors → field of 3 with novel distractors',
    teachingSteps: 'Present a field of three, deliver the SD once, wait 3 seconds, and prompt using the hierarchy. Rotate item positions every trial.',
    masteryCriteria: '90% correct across 3 consecutive sessions in a field of 3.',
    errorCorrection: ERROR_CORRECTION,
    teachingMethod: 'Discrete Trial Training (DTT)',
    netTeachingIdea: 'Ask the learner to find items during clean-up or while unpacking a lunch bag.',
    tasks: [
      task('Touch “ball”', '“Touch ball”', 'Touches the ball within 3 seconds in a field of 3.', 'mastered', { prompts: PROMPTS_MOST_TO_LEAST }),
      task('Touch “cup”', '“Touch cup”', 'Touches the cup within 3 seconds in a field of 3.', 'maintenance', { prompts: PROMPTS_MOST_TO_LEAST }),
      task('Touch “shoe”', '“Touch shoe”', 'Touches the shoe within 3 seconds in a field of 3.', 'in_treatment', { prompts: PROMPTS_MOST_TO_LEAST }),
    ],
  },
  imitation: {
    title: 'Gross motor imitation',
    domain: 'Motor Imitation',
    assessmentType: 'PEAK',
    status: 'maintenance',
    measurement: { method: 'probe', procedure: 'Probe', trials: 5 },
    sd: '“Do this” paired with the model action.',
    objective: 'The learner imitates single gross motor actions on the first model.',
    description: 'Maintains previously mastered imitation skills with weekly probes.',
    goal: 'Imitate 15 gross motor actions after a single model.',
    masterySteps: 'Single actions with objects → single actions without objects → two-step action chains',
    teachingSteps: 'Gain attention, say “Do this” while modelling the action, and reinforce a correct imitation within 3 seconds.',
    masteryCriteria: '100% first-trial probe accuracy across 2 consecutive weekly probes.',
    errorCorrection: 'Re-model with a physical prompt, then re-present the SD for an independent response.',
    teachingMethod: 'Discrete Trial Training (DTT)',
    netTeachingIdea: 'Play “Simon says” during movement breaks.',
    tasks: [
      task('Clap hands', '“Do this” + clap', 'Claps hands twice within 3 seconds of the model.', 'mastered', { masteryProbe: 100 }),
      task('Arms up', '“Do this” + raise arms', 'Raises both arms above the head.', 'maintenance', { masteryProbe: 100 }),
      task('Stomp feet', '“Do this” + stomp', 'Stomps both feet alternately at least twice.', 'maintenance', { masteryProbe: 100 }),
    ],
  },
  social: {
    title: 'Peer greetings and turn taking',
    domain: 'Social Skills',
    assessmentType: 'Vineland-3',
    status: 'in_treatment',
    measurement: { method: 'probe', procedure: 'Probe', trials: 5 },
    sd: 'A peer approaches and says hello, or a shared game is presented.',
    objective: 'The learner greets peers and waits for a turn during structured play.',
    description: 'Targets reciprocal greetings and turn taking with a trained peer during small-group play.',
    goal: 'Greet peers and take turns in a 5-minute game without prompts.',
    masterySteps: 'Greeting with prompt → independent greeting → greeting plus name → turn taking for 3 rounds',
    teachingSteps: 'Prime the learner before play, arrange the peer to approach, and use a visual “my turn / your turn” card during the game.',
    masteryCriteria: '80% independent responses across 3 consecutive sessions with 2 different peers.',
    errorCorrection: 'Provide a verbal model of the greeting and allow the peer to re-approach.',
    teachingMethod: 'Peer-mediated instruction with visual supports',
    netTeachingIdea: 'Practise greetings at arrival and turn taking with a board game at recess.',
    tasks: [
      task('Wave and say hi', 'Peer says “Hi [name]”', 'Waves and says “hi” within 5 seconds of the peer’s greeting.', 'in_treatment', { masteryProbe: 80 }),
      task('Say peer’s name', 'Peer approaches', 'Greets the peer using their name.', 'in_treatment', { phase: 'baseline', masteryProbe: 80 }),
      task('Wait for turn', 'Shared game, peer’s turn', 'Waits with hands down until the turn card is passed back.', 'on_hold', { masteryProbe: 80 }),
    ],
  },
  dailyLiving: {
    title: 'Handwashing routine',
    domain: 'Daily Living',
    assessmentType: 'AFLS',
    status: 'on_hold',
    measurement: { method: 'trial', procedure: 'Step by Step', trials: 6 },
    sd: '“Time to wash your hands.”',
    objective: 'The learner completes the six-step handwashing routine independently.',
    description: 'Forward chaining of the handwashing routine with a picture schedule at the sink.',
    goal: 'Complete all six handwashing steps independently before snack time.',
    masterySteps: 'Steps 1–2 independent → steps 1–4 independent → full routine with picture schedule → full routine without schedule',
    teachingSteps: 'Use forward chaining: the learner completes mastered steps independently and the therapist prompts the next step. Reinforce at the end of the chain.',
    masteryCriteria: '100% of steps independent across 3 consecutive opportunities.',
    errorCorrection: 'Point to the picture for the missed step and wait 3 seconds before a gestural prompt.',
    teachingMethod: 'Task analysis with forward chaining',
    netTeachingIdea: 'Practise before snack and after outdoor play.',
    tasks: [
      task('Turn on tap', '“Turn on the water”', 'Turns the tap on without assistance.', 'mastered', { masteryProbe: 100 }),
      task('Apply soap', '“Get soap”', 'Presses the soap pump once and rubs palms together.', 'in_treatment', { masteryProbe: 100 }),
      task('Rinse and dry', '“Rinse and dry”', 'Rinses both hands and dries with a towel.', 'on_hold', { masteryProbe: 100 }),
    ],
  },
  tacting: {
    title: 'Tacting actions',
    domain: 'Communication',
    assessmentType: 'VB-MAPP',
    status: 'mastered',
    measurement: { method: 'probe', procedure: 'Probe', trials: 5 },
    sd: '“What is she doing?” while showing an action picture.',
    objective: 'The learner labels actions in pictures and video clips.',
    description: 'Labelling common actions using “-ing” verbs; now mastered and generalised across materials.',
    goal: 'Label 15 actions across pictures, video and live models.',
    masterySteps: 'Pictures → video clips → live actions → novel examples',
    teachingSteps: 'Present the stimulus with the SD, wait 3 seconds, and use an echoic prompt if needed. Fade to a partial echoic.',
    masteryCriteria: '90% correct on cold probes across 3 consecutive sessions.',
    errorCorrection: ERROR_CORRECTION,
    teachingMethod: 'Discrete Trial Training (DTT)',
    netTeachingIdea: 'Narrate actions during play and pause for the learner to fill in the verb.',
    tasks: [
      task('Tact “jumping”', '“What is he doing?” (jumping)', 'Says “jumping” within 3 seconds.', 'mastered'),
      task('Tact “eating”', '“What is she doing?” (eating)', 'Says “eating” within 3 seconds.', 'mastered'),
      task('Tact “sleeping”', '“What is he doing?” (sleeping)', 'Says “sleeping” within 3 seconds.', 'mastered'),
    ],
  },
  instructions: {
    title: 'Following two-step instructions',
    domain: 'Receptive Language',
    assessmentType: 'ESDM Checklist',
    status: 'in_treatment',
    measurement: { method: 'trial', procedure: 'Step by Step', trials: 8 },
    sd: 'Give a two-step instruction, e.g. “Get your cup and put it in the sink.”',
    objective: 'The learner completes related two-step instructions without repetition.',
    description: 'Builds compliance with multi-step instructions used in classroom and home routines.',
    goal: 'Follow 10 different two-step instructions across settings.',
    masterySteps: 'Related steps with gesture → related steps without gesture → unrelated steps',
    teachingSteps: 'Deliver the instruction once, wait 5 seconds, and prompt the second step with a gesture if needed.',
    masteryCriteria: '85% correct across 3 consecutive sessions.',
    errorCorrection: 'Repeat the instruction once with a gesture for the missed step.',
    teachingMethod: 'Natural Environment Teaching (NET)',
    netTeachingIdea: 'Use clean-up time and transitions to give two-step instructions.',
    tasks: [
      task('Stand up and push in chair', '“Stand up and push in your chair”', 'Completes both steps in order within 10 seconds.', 'maintenance', { masteryProbe: 85 }),
      task('Get cup, put in sink', '“Get your cup and put it in the sink”', 'Completes both steps in order within 15 seconds.', 'in_treatment', { masteryProbe: 85 }),
      task('Get shoes, sit on bench', '“Get your shoes and sit on the bench”', 'Completes both steps in order within 15 seconds.', 'in_treatment', { phase: 'baseline', masteryProbe: 85 }),
    ],
  },
};

const SAMPLE_CLIENTS: SampleClient[] = [
  { code: 'SMP-AR01', displayName: 'Aiden Reyes', preferredName: null, dateOfBirth: '2019-04-12', language: 'English', programs: [PROGRAMS.mand, PROGRAMS.receptive, PROGRAMS.imitation] },
  { code: 'SMP-BC02', displayName: 'Bella Chen', preferredName: null, dateOfBirth: '2018-09-03', language: 'English, Mandarin', programs: [PROGRAMS.social, PROGRAMS.tacting, PROGRAMS.instructions] },
  { code: 'SMP-CO03', displayName: 'Caleb Okafor', preferredName: null, dateOfBirth: '2020-01-27', language: 'English', programs: [PROGRAMS.mand, PROGRAMS.dailyLiving, PROGRAMS.imitation] },
  { code: 'SMP-DP04', displayName: 'Diya Patel', preferredName: null, dateOfBirth: '2017-11-15', language: 'English, Gujarati', programs: [PROGRAMS.receptive, PROGRAMS.social, PROGRAMS.dailyLiving] },
  { code: 'SMP-EB05', displayName: 'Ethan Brooks', preferredName: null, dateOfBirth: '2019-07-08', language: 'English', programs: [PROGRAMS.instructions, PROGRAMS.tacting, PROGRAMS.mand] },
  { code: 'SMP-FL06', displayName: 'Freya Lindqvist', preferredName: null, dateOfBirth: '2018-02-21', language: 'English, Swedish', programs: [PROGRAMS.imitation, PROGRAMS.social, PROGRAMS.receptive] },
];

export interface SampleDataResult {
  organizationId: string;
  organizationName: string;
  created: string[];
  skipped: string[];
  programs: number;
  tasks: number;
}

interface Member {
  user_id: string;
  name: string;
}

/**
 * Adds sample clients, programs and tasks to one organisation and assigns them to its existing therapists and
 * clinical supervisors. Clients whose sample code already exists are skipped, so existing records are never changed.
 */
export async function seedSampleData(db: Database, organizationRef?: string): Promise<SampleDataResult> {
  const organization = await findOrganization(db, organizationRef);
  const members = async (role: string) =>
    db.query<{ [key: string]: unknown } & Member>(
      `SELECT m.user_id, u.name FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.role = $2 AND m.status = 'active' ORDER BY u.name`,
      [organization.id, role],
    );
  const therapists = await members('therapist');
  const supervisors = await members('clinical_supervisor');
  if (therapists.length === 0 || supervisors.length === 0) {
    throw new Error(`${organization.name} needs at least one active therapist and one active clinical supervisor before sample data can be assigned.`);
  }
  const author = (await members('organization_admin'))[0] ?? supervisors[0];

  const result: SampleDataResult = { organizationId: organization.id, organizationName: organization.name, created: [], skipped: [], programs: 0, tasks: 0 };
  await db.withTenant(organization.id, async (tx) => {
    const timezone = asString((await tx.query<{ timezone: string }>(`SELECT timezone FROM organizations WHERE id = $1`, [organization.id]))[0]?.timezone ?? 'UTC');
    for (const [index, client] of SAMPLE_CLIENTS.entries()) {
      const existing = await tx.query(`SELECT 1 AS present FROM clients WHERE organization_id = $1 AND lower(client_code) = lower($2)`, [organization.id, client.code]);
      if (existing.length > 0) {
        result.skipped.push(client.code);
        continue;
      }
      const therapist = therapists[index % therapists.length];
      const supervisor = supervisors[index % supervisors.length];
      const clinicId = await clinicFor(tx, organization.id, therapist.user_id);
      const clientId = asString(
        (
          await tx.query<{ id: string }>(
            `INSERT INTO clients (organization_id, clinic_id, display_name, client_code, preferred_name, language, timezone, date_of_birth, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [organization.id, clinicId, client.displayName, client.code, client.preferredName, client.language, timezone, client.dateOfBirth, author.user_id],
          )
        )[0]?.id,
      );
      for (const [userId, relationship] of [[therapist.user_id, 'therapist'], [supervisor.user_id, 'supervisor']]) {
        await tx.query(
          `INSERT INTO client_assignments (organization_id, client_id, user_id, relationship, created_by) VALUES ($1, $2, $3, $4, $5)`,
          [organization.id, clientId, userId, relationship, author.user_id],
        );
      }
      await recordAudit(tx, {
        organizationId: organization.id, actorUserId: author.user_id, action: 'client.created',
        targetType: 'client', targetId: clientId, metadata: { sample: true },
      });
      for (const program of client.programs) {
        result.tasks += await insertProgram(tx, organization.id, clientId, program, author.user_id);
        result.programs += 1;
      }
      result.created.push(client.code);
    }
  });
  return result;
}

async function findOrganization(db: Database, reference?: string): Promise<{ id: string; name: string }> {
  const rows = reference
    ? await db.query<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id::text = $1 OR lower(name) = lower($1)`, [reference])
    : await db.query<{ id: string; name: string }>(
        `SELECT o.id, o.name FROM organizations o
         WHERE EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.role = 'therapist' AND m.status = 'active')
           AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.role = 'clinical_supervisor' AND m.status = 'active')
         ORDER BY o.created_at`,
      );
  if (rows.length !== 1) {
    throw new Error(
      rows.length === 0
        ? 'No matching organisation with an active therapist and clinical supervisor was found.'
        : `Several organisations match: ${rows.map((row) => row.name).join(', ')}. Pass --organization with a name or id.`,
    );
  }
  return { id: asString(rows[0].id), name: asString(rows[0].name) };
}

/** The therapist's clinic when they are limited to one, otherwise the organisation's first clinic. */
async function clinicFor(tx: Queryable, organizationId: string, therapistId: string): Promise<string> {
  const rows = await tx.query<{ clinic_id: string }>(
    `SELECT clinic_id FROM (
       SELECT a.clinic_id, 0 AS rank, a.created_at FROM clinic_access a WHERE a.organization_id = $1 AND a.user_id = $2
       UNION ALL
       SELECT c.id, 1, c.created_at FROM clinics c WHERE c.organization_id = $1
     ) options ORDER BY rank, created_at LIMIT 1`,
    [organizationId, therapistId],
  );
  return asString(rows[0]?.clinic_id);
}

async function insertProgram(tx: Queryable, organizationId: string, clientId: string, program: SampleProgram, userId: string): Promise<number> {
  const { method, procedure, trials } = program.measurement;
  const programId = asString(
    (
      await tx.query<{ id: string }>(
        `INSERT INTO client_programs (
           organization_id, client_id, name, description, objective, teaching_procedure, date_implemented, review_on, date_mastered,
           status, measurement_type, expected_trial_count, mastery_criteria, notes, created_by, domain, assessment_type, sd,
           mastery_steps, error_correction_procedure, teaching_method, net_teaching_idea, measurement_procedure
         ) VALUES (
           $1, $2, $3, $4, $5, $6, CURRENT_DATE - 60, CURRENT_DATE + 30, CASE WHEN $7 = 'mastered' THEN CURRENT_DATE - 7 ELSE NULL END,
           $7, $8, $9, $10, 'Sample data for demonstration.', $11, $12, $13, $14, $15, $16, $17, $18, $19
         ) RETURNING id`,
        [
          organizationId, clientId, program.title, program.description, program.objective, program.teachingSteps, program.status,
          method, trials, program.masteryCriteria, userId, program.domain, program.assessmentType, program.sd, program.masterySteps,
          program.errorCorrection, program.teachingMethod, program.netTeachingIdea, procedure,
        ],
      )
    )[0]?.id,
  );
  await tx.query(
    `INSERT INTO program_configuration_versions (
       organization_id, program_id, version, measurement_type, expected_trial_count, mastery_criteria, teaching_procedure, reason, created_by
     ) VALUES ($1, $2, 1, $3, $4, $5, $6, 'Initial configuration', $7)`,
    [organizationId, programId, method, trials, program.masteryCriteria, program.teachingSteps, userId],
  );
  await tx.query(
    `INSERT INTO program_goals (organization_id, client_id, program_id, statement, objective, review_on, created_by)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE + 30, $6)`,
    [organizationId, clientId, programId, program.goal, program.objective, userId],
  );
  if (program.status !== 'in_treatment') {
    await recordChangeReason(tx, { organizationId, recordType: 'program', recordId: programId, reason: 'Sample data: starting status.', userId });
  }

  for (const [sortOrder, item] of program.tasks.entries()) {
    const targetId = asString(
      (
        await tx.query<{ id: string }>(
          `INSERT INTO client_targets (
             organization_id, client_id, program_id, name, description, operational_definition, measurement_method, expected_trial_count,
             baseline_note, teaching_instructions, prompt_hierarchy, mastery_criteria, phase, status, started_on, review_on,
             clinical_notes, sort_order, created_by, sd, mastery_sessions, mastery_probe, baseline_sessions, baseline_probe
           ) VALUES (
             $1, $2, $3, $4, '', $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_DATE - 45, CURRENT_DATE + 30,
             '', $14, $15, $16, $17, $18, $19, $20
           ) RETURNING id`,
          [
            organizationId, clientId, programId, item.title, item.operationalDefinition, method, trials,
            item.phase === 'baseline' ? 'Baseline probes in progress.' : '', program.teachingSteps, item.promptHierarchy,
            `${item.masterySessions} sessions at ${item.masteryProbe}%`, item.phase, item.status, sortOrder, userId,
            item.sd, item.masterySessions, item.masteryProbe, item.baselineSessions ?? null, item.baselineProbe ?? null,
          ],
        )
      )[0]?.id,
    );
    await tx.query(
      `INSERT INTO target_configuration_versions (
         organization_id, target_id, version, measurement_method, expected_trial_count, mastery_criteria,
         baseline_note, prompt_hierarchy, teaching_instructions, reason, created_by
       ) VALUES ($1, $2, 1, $3, $4, $5, '', $6, $7, 'Initial configuration', $8)`,
      [organizationId, targetId, method, trials, `${item.masterySessions} sessions at ${item.masteryProbe}%`, item.promptHierarchy, program.teachingSteps, userId],
    );
    if (item.status !== 'in_treatment') {
      await recordChangeReason(tx, { organizationId, recordType: 'target', recordId: targetId, reason: 'Sample data: starting status.', userId });
    }
  }
  return program.tasks.length;
}
