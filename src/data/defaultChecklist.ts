import { ChecklistDoc } from '../types';

export const FULL_CHECKLIST_LABEL = 'Full branch inspection';

/**
 * The checklist every branch starts with. Once the app runs, the live
 * checklist lives in storage and is edited from the Checklist screen — this is
 * only the seed used on first run and by 'Reset to default'.
 *
 * Because all lists run together, a check must appear exactly once. Things
 * there is one of per branch live in the 'branchwide' list; things each area
 * has its own of stay in that area's list, named for the area so the inspector
 * knows which unit is meant.
 *
 * Categories name what they actually hold. A check belongs to the concern it
 * tests, not to whichever category it was first written under — a gas cylinder
 * area is an external area, not a food item, and a CCTV camera is security,
 * not pest control. Where a category spans more than one concern its title
 * says so rather than hiding the extras.
 *
 * Ids are never recycled. Each list keeps a `nextItemId` and the document
 * keeps a `nextIdBase`, both of which only ever increase — answers are stored
 * under `idBase + local id`, so reusing a number would hand one check's
 * inspection history to another. That is also why regrouping only ever moves a
 * check between categories *within* its list: moving it to another list would
 * change its id and orphan every past answer. Removing a check archives it
 * rather than deleting it whenever a past inspection already answered it. Gaps
 * in the numbering are expected; the 1..N numbering the screens show is worked
 * out separately from position.
 *
 * `severity` is the inherent risk of that item failing, and is the starting
 * point for the priority a flagged issue is given — see services/priority.ts:
 *   critical  immediate food-safety or life-safety hazard
 *   high      likely to cause harm if left unaddressed
 *   medium    standards breach, contained
 *   low       presentation or housekeeping
 *
 * The live list is the CHECKLIST STANDARD sheet: nine categories, 76 checks.
 * The four lists it replaced (kitchen, front of house, branch-wide and
 * temperature) are kept below as archived rather than deleted, so any
 * inspection already recorded against them still renders its report. They are
 * not offered to new inspections; the Checklist screen shows them only under
 * 'Show removed'. A failed check in the MAINTENANCE group raises a job on the
 * maintenance board when the inspection is submitted.
 */
export const DEFAULT_CHECKLIST: ChecklistDoc = {
  nextIdBase: 6000,
  lists: [
    {
      // The CHECKLIST STANDARD sheet, category for category and in its order.
      key: 'standard',
      label: 'Inspection checklist',
      idBase: 5000,
      nextItemId: 77,
      nextSectionKey: 10,
      sections: [
        {
          key: 'standard-s1',
          title: 'Staff hygiene',
          items: [
            { id: 1, text: 'Food handlers wearing clean uniform', reasonGroup: 'STAFF', severity: 'medium' },
            { id: 2, text: 'Hair/beard properly restrained where applicable', reasonGroup: 'STAFF', severity: 'high' },
            { id: 3, text: 'No eating, drinking or smoking in food-preparation areas', reasonGroup: 'STAFF', severity: 'high' },
            { id: 4, text: 'No jewellery/watch or other contamination risks during food handling', reasonGroup: 'STAFF', severity: 'medium' },
            { id: 5, text: 'Cuts/wounds properly covered with suitable waterproof dressing', reasonGroup: 'STAFF', severity: 'high' },
            { id: 6, text: 'Disposable gloves used correctly where required', reasonGroup: 'STAFF', severity: 'high' },
            { id: 7, text: 'Staff personal belongings kept away from food areas', reasonGroup: 'STAFF', severity: 'low' },
          ],
        },
        {
          key: 'standard-s2',
          title: 'Facility / premises',
          items: [
            { id: 8, text: 'Premises structurally sound', reasonGroup: 'MAINTENANCE', severity: 'high' },
            { id: 9, text: 'Floors cleaned and maintained', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 10, text: 'Walls/ceilings cleaned and maintained', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 11, text: 'Adequate lighting', reasonGroup: 'MAINTENANCE', severity: 'medium' },
            { id: 12, text: 'Adequate drainage', reasonGroup: 'MAINTENANCE', severity: 'high' },
            { id: 13, text: 'No water leakage', reasonGroup: 'MAINTENANCE', severity: 'high' },
            { id: 14, text: 'Doors/windows maintained', reasonGroup: 'MAINTENANCE', severity: 'medium' },
            { id: 15, text: 'No unnecessary items stored in food areas', reasonGroup: 'CLEANING', severity: 'low' },
            { id: 16, text: 'Dirty flow appropriately controlled (manholes)', reasonGroup: 'MAINTENANCE', severity: 'high' },
            { id: 17, text: 'Tables/service counters clean', reasonGroup: 'CLEANING', severity: 'medium' },
          ],
        },
        {
          key: 'standard-s3',
          title: 'Handwashing facilities',
          items: [
            { id: 18, text: 'Dedicated handwash basin available', reasonGroup: 'EQUIPMENT', severity: 'high' },
            { id: 19, text: 'Liquid hand soap available', reasonGroup: 'SUPPLY', severity: 'high' },
            { id: 20, text: 'Disposable paper towels/approved hand-drying facility available', reasonGroup: 'SUPPLY', severity: 'medium' },
            { id: 21, text: 'Handwash signage displayed where required', reasonGroup: 'SUPPLY', severity: 'low' },
            { id: 22, text: 'Handwash basin clean and maintained', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 23, text: 'No utensils/food stored in handwash basin', reasonGroup: 'STAFF', severity: 'medium' },
            { id: 24, text: 'Toilets clean', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 25, text: 'Cleaning records maintained', reasonGroup: 'RECORDS', severity: 'medium' },
          ],
        },
        {
          key: 'standard-s4',
          title: 'Kitchen / food preparation hygiene',
          items: [
            { id: 26, text: 'Hot holding equipment functioning (bain-marie, oven etc.)', reasonGroup: 'EQUIPMENT', severity: 'high' },
            { id: 27, text: 'Working tables clean and sanitised', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 28, text: 'Preparation tables clean and in good condition', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 29, text: 'Cutting boards clean, sanitised and in good condition', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 30, text: 'Utensils clean and properly stored', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 31, text: 'Food preparation equipment clean (mincer, blender etc.)', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 32, text: 'Floors clean and free from food debris', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 33, text: 'Walls/ceilings clean and maintained', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 34, text: 'Drains clean and functioning properly', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 35, text: 'No evidence of pests/insects/rodents', reasonGroup: 'PEST', severity: 'critical' },
            { id: 36, text: 'Exhaust/hood system clean and maintained', reasonGroup: 'CLEANING', severity: 'high' },
          ],
        },
        {
          key: 'standard-s5',
          title: 'Dry food storage',
          items: [
            { id: 37, text: 'Cleaning chemicals stored away from food', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 38, text: 'Raw food kept separate from cooked/ready-to-eat food', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 39, text: 'Food stored off the floor', reasonGroup: 'FOOD', severity: 'medium' },
            { id: 40, text: 'Shelves clean and in good condition', reasonGroup: 'CLEANING', severity: 'low' },
            { id: 41, text: 'FIFO/FEFO system implemented', reasonGroup: 'FOOD', severity: 'medium' },
            { id: 42, text: 'Opened food properly covered/contained', reasonGroup: 'FOOD', severity: 'high' },
            { id: 43, text: 'Food containers labelled appropriately', reasonGroup: 'FOOD', severity: 'medium' },
            { id: 44, text: 'Expiry/use-by dates checked', reasonGroup: 'FOOD', severity: 'high' },
            { id: 45, text: 'No damaged/infested food packages', reasonGroup: 'FOOD', severity: 'high' },
          ],
        },
        {
          key: 'standard-s6',
          title: 'Chilled / refrigerated storage',
          items: [
            { id: 46, text: 'No expired food/drinks displayed', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 47, text: 'Refrigerator temperature monitored', reasonGroup: 'TEMPERATURE', severity: 'high' },
            { id: 48, text: 'Temperature records maintained', reasonGroup: 'RECORDS', severity: 'high' },
            { id: 49, text: 'Food stored covered/protected', reasonGroup: 'FOOD', severity: 'high' },
            { id: 50, text: 'Raw and ready-to-eat food segregated', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 51, text: 'Raw meat/poultry stored appropriately below ready-to-eat foods', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 52, text: 'No overloaded refrigerators', reasonGroup: 'TEMPERATURE', severity: 'medium' },
            { id: 53, text: 'Refrigerator clean and free of spills', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 54, text: 'Door seals/gaskets in good condition', reasonGroup: 'EQUIPMENT', severity: 'medium' },
            { id: 55, text: 'No expired food', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 56, text: 'Food appropriately labelled/date marked', reasonGroup: 'FOOD', severity: 'high' },
          ],
        },
        {
          key: 'standard-s7',
          title: 'Dishwashing and cleaning',
          items: [
            { id: 57, text: 'Dishwashing area clean', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 58, text: 'Dirty and clean utensils separated', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 59, text: 'Dishwasher operating correctly, if applicable', reasonGroup: 'EQUIPMENT', severity: 'medium' },
            { id: 60, text: 'Correct detergent/chemical used', reasonGroup: 'SUPPLY', severity: 'medium' },
            { id: 61, text: 'Clean utensils stored hygienically', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 62, text: 'No standing dirty water', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 63, text: 'Drying method hygienic (pantry)', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 64, text: 'Bins have lids where required', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 65, text: 'Bins clean and not overflowing', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 66, text: 'Adequate waste bins available', reasonGroup: 'SUPPLY', severity: 'low' },
          ],
        },
        {
          key: 'standard-s8',
          title: 'Documentation & management',
          items: [
            { id: 67, text: 'Valid licences/approvals available', reasonGroup: 'RECORDS', severity: 'high' },
            { id: 68, text: 'Valid outdoor seating permit available, if applicable', reasonGroup: 'RECORDS', severity: 'medium' },
            { id: 69, text: 'Valid NOC available for signage advertisement, if applicable', reasonGroup: 'RECORDS', severity: 'low' },
            { id: 70, text: 'Pest-control documentation available', reasonGroup: 'RECORDS', severity: 'medium' },
            { id: 71, text: 'Valid Hassantuk certificate available', reasonGroup: 'RECORDS', severity: 'high' },
            { id: 72, text: 'Staff training records maintained (ADAFSA)', reasonGroup: 'RECORDS', severity: 'medium' },
          ],
        },
        {
          key: 'standard-s9',
          title: 'Pest control',
          items: [
            { id: 73, text: 'No live/dead insects observed', reasonGroup: 'PEST', severity: 'critical' },
            { id: 74, text: 'Pest-control records available', reasonGroup: 'RECORDS', severity: 'medium' },
            { id: 75, text: 'Doors/windows/openings adequately protected', reasonGroup: 'PEST', severity: 'high' },
            { id: 76, text: 'Pest-control devices appropriately located', reasonGroup: 'PEST', severity: 'medium' },
          ],
        },
      ],
    },

    // ---- Replaced by the list above. Archived, kept for past reports. ----
    {
      key: 'kitchen',
      archived: true,
      label: 'Kitchen hygiene',
      idBase: 1000,
      nextItemId: 28,
      nextSectionKey: 6,
      sections: [
        {
          key: 'kitchen-s1',
          title: 'Personal hygiene',
          items: [
            { id: 1, text: 'Employees are wearing proper uniform', reasonGroup: 'STAFF', severity: 'low' },
            { id: 2, text: 'Staff wearing hairnets (includes kitchen staff and dishwasher)', reasonGroup: 'STAFF', severity: 'high' },
            { id: 3, text: 'Male and female fingernails trimmed', reasonGroup: 'STAFF', severity: 'medium' },
            { id: 4, text: 'Working employees must wear shoes', reasonGroup: 'STAFF', severity: 'medium' },
            { id: 5, text: 'Gloves are worn while preparing and serving food', reasonGroup: 'STAFF', severity: 'high' },
          ],
        },
        {
          // How food is kept and kept apart. 7 and 14 moved here from "Work
          // place hygiene" — both are food-protection controls, not cleaning.
          key: 'kitchen-s2',
          title: 'Food handling and storage',
          items: [
            { id: 7, text: 'Raw and cooked foods separated', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 14, text: 'Chemicals stored away from food', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 15, text: 'Dry food items stored and stacked properly', reasonGroup: 'FOOD', severity: 'medium' },
            { id: 17, text: 'Storage items stacked properly (masala etc.)', reasonGroup: 'FOOD', severity: 'low' },
            { id: 18, text: 'Frozen items stored according to standard as briefed', reasonGroup: 'FOOD', severity: 'high' },
            { id: 19, text: 'Bain-marie working properly, food covered', reasonGroup: 'EQUIPMENT', severity: 'high' },
          ],
        },
        {
          // 20 and 23 moved here from "Food items checking points" — both are
          // cleaning checks that happened to mention food.
          key: 'kitchen-s3',
          title: 'Kitchen cleaning',
          items: [
            { id: 8, text: 'Exhaust filters washed properly', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 10, text: 'Kitchen walls and ceilings are clean', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 13, text: 'Floor cleaned during operation', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 20, text: 'Snack counter cleaned, food items stored properly', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 23, text: 'Chillers cleaned outside and inside', reasonGroup: 'CLEANING', severity: 'medium' },
          ],
        },
        {
          // 16, 24 and 25 were filed under "Food items checking points" — an
          // insect sighting, a gas cylinder bay and a yard are none of them
          // food items.
          key: 'kitchen-s4',
          title: 'Waste, pest control and external areas',
          items: [
            { id: 11, text: 'Garbage bin covered and cleared', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 16, text: 'No insect activity observed', reasonGroup: 'PEST', severity: 'critical' },
            { id: 24, text: 'Kitchen gas cylinder area cleaned and cleared', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 25, text: 'Kitchen outside area cleared', reasonGroup: 'CLEANING', severity: 'low' },
          ],
        },
        {
          key: 'kitchen-s5',
          title: 'Temperature records',
          items: [
            { id: 22, text: 'Kitchen chiller temperature sheet filled on time', reasonGroup: 'RECORDS', severity: 'high' },
          ],
        },
      ],
    },
    {
      key: 'frontofhouse',
      archived: true,
      label: 'Front of house',
      idBase: 2000,
      nextItemId: 28,
      nextSectionKey: 7,
      sections: [
        {
          // 5 and 11 were split across "General area" and "Hygiene and pest
          // control"; both are about how staff turn out.
          key: 'frontofhouse-s1',
          title: 'Staff presentation',
          items: [
            { id: 5, text: 'Gloves worn while serving food', reasonGroup: 'STAFF', severity: 'high' },
            { id: 11, text: 'Staff appearance neat and hygienic', reasonGroup: 'STAFF', severity: 'medium' },
          ],
        },
        {
          key: 'frontofhouse-s2',
          title: 'Dining and counter cleaning',
          items: [
            { id: 1, text: 'Entrance area clean and welcoming', reasonGroup: 'CLEANING', severity: 'low' },
            { id: 2, text: 'Floors clean and free from spills', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 3, text: 'Tables sanitized, chairs clean and in good condition', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 8, text: 'Glass and windows are clean', reasonGroup: 'CLEANING', severity: 'low' },
            { id: 13, text: 'Serving counters clean and organized', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 18, text: 'Pastry shop area clean, no unauthorized person present', reasonGroup: 'CLEANING', severity: 'medium' },
            { id: 19, text: 'Cash counter shelves clean and well organized', reasonGroup: 'CLEANING', severity: 'low' },
            { id: 23, text: 'Sweet counter cleaned, items displayed properly', reasonGroup: 'CLEANING', severity: 'medium' },
          ],
        },
        {
          // What the guest is provided with, rather than what is cleaned
          key: 'frontofhouse-s3',
          title: 'Guest facilities',
          items: [
            { id: 4, text: 'Menu cards clean and updated', reasonGroup: 'SUPPLY', severity: 'low' },
            { id: 7, text: 'Hand sanitizer available for guests', reasonGroup: 'SUPPLY', severity: 'low' },
            { id: 16, text: 'Temperature in dining area comfortable', reasonGroup: 'EQUIPMENT', severity: 'low' },
            { id: 17, text: 'Signboards visible, readable and clean', reasonGroup: 'CLEANING', severity: 'low' },
          ],
        },
        {
          // 14 was filed under "Hygiene and pest control"; a camera is neither
          key: 'frontofhouse-s4',
          title: 'Equipment and security',
          items: [
            { id: 6, text: 'Air conditioning and lighting functioning properly', reasonGroup: 'EQUIPMENT', severity: 'medium' },
            { id: 14, text: 'CCTV cameras functioning properly', reasonGroup: 'EQUIPMENT', severity: 'medium' },
          ],
        },
        {
          // 20, 24 and 25 were filed under "Service checking points"
          key: 'frontofhouse-s5',
          title: 'Pest control and outside areas',
          items: [
            { id: 10, text: 'No pest activity observed', reasonGroup: 'PEST', severity: 'critical' },
            { id: 20, text: 'Outdoor area floor clean and organized', reasonGroup: 'CLEANING', severity: 'low' },
            { id: 24, text: 'Front of house gas cylinder area cleaned and cleared', reasonGroup: 'CLEANING', severity: 'high' },
            { id: 25, text: 'Shopfront outside area cleared', reasonGroup: 'CLEANING', severity: 'low' },
          ],
        },
        {
          key: 'frontofhouse-s6',
          title: 'Records and registers',
          items: [
            { id: 15, text: 'Guest complaint register available', reasonGroup: 'RECORDS', severity: 'medium' },
            { id: 22, text: 'Front counter chiller temperature sheet filled on time', reasonGroup: 'RECORDS', severity: 'high' },
          ],
        },
      ],
    },
    {
      // Checks there is one of per branch. Kept here rather than repeated in
      // each area's list, so they are answered once per inspection.
      key: 'branchwide',
      archived: true,
      label: 'Branch-wide',
      idBase: 3000,
      nextItemId: 6,
      nextSectionKey: 3,
      sections: [
        {
          key: 'branchwide-s1',
          title: 'Food safety and labeling',
          items: [
            { id: 1, text: 'No expired food in stock', reasonGroup: 'FOOD', severity: 'critical' },
            { id: 2, text: 'Food properly labeled and dated', reasonGroup: 'FOOD', severity: 'high' },
          ],
        },
        {
          // Was "Safety and facilities", which said nothing about the fly
          // killer sitting in it
          key: 'branchwide-s2',
          title: 'Safety and shared equipment',
          items: [
            { id: 3, text: 'Fire extinguisher inspection current and available', reasonGroup: 'SAFETY', severity: 'critical' },
            { id: 4, text: 'Hand wash working properly', reasonGroup: 'EQUIPMENT', severity: 'high' },
            { id: 5, text: 'Fly killer working properly', reasonGroup: 'EQUIPMENT', severity: 'medium' },
          ],
        },
      ],
    },
    {
      // Measured temperatures, walked with a probe. Kept apart from the
      // "temperature sheet filled on time" checks in the kitchen and front of
      // house lists — those ask whether the log was written up, these ask what
      // the food and the units are actually running at.
      key: 'temperature',
      archived: true,
      label: 'Temperature control',
      idBase: 4000,
      nextItemId: 14,
      nextSectionKey: 3,
      sections: [
        {
          key: 'temperature-s1',
          title: 'Storage temperatures',
          items: [
            { id: 1, text: 'Chiller running at or below 5°C', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 2, text: 'Freezer running at or below -18°C', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 3, text: 'Cold display counter at or below 5°C', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 4, text: 'Chilled deliveries checked at or below 5°C on arrival', reasonGroup: 'TEMPERATURE', severity: 'high' },
            { id: 5, text: 'Frozen deliveries checked at or below -18°C on arrival', reasonGroup: 'TEMPERATURE', severity: 'high' },
            { id: 6, text: 'Chiller and freezer door seals intact, doors closing fully', reasonGroup: 'EQUIPMENT', severity: 'medium' },
          ],
        },
        {
          key: 'temperature-s2',
          title: 'Cooking, holding and cooling',
          items: [
            { id: 7, text: 'Cooked food reaches 75°C at the core', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 8, text: 'Reheated food reaches 75°C at the core before service', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 9, text: 'Hot holding kept at or above 63°C', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 10, text: 'Cooked food cooled from 60°C to 5°C within four hours', reasonGroup: 'TEMPERATURE', severity: 'critical' },
            { id: 11, text: 'Probe thermometer available and working', reasonGroup: 'EQUIPMENT', severity: 'high' },
            { id: 12, text: 'Probe thermometer calibrated and calibration recorded', reasonGroup: 'RECORDS', severity: 'high' },
            { id: 13, text: 'Probe sanitised before and between uses', reasonGroup: 'CLEANING', severity: 'high' },
          ],
        },
      ],
    },
  ],
};
