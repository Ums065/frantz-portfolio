-- =====================================================================
--  dummydatav2.sql  --  Judge-section test data (3 detailed submissions)
-- ---------------------------------------------------------------------
--  Purpose : seed THREE fully-approved students, each with a long,
--            detailed project submission + 10 distinct business
--            interviews + supporting materials, plus one ready-to-use
--            judge login, so the Judge dashboard, scoring, averaging
--            and ranking can all be tested with real variety.
--  Idempotent : safe to re-run. It first deletes any previous v2 demo
--               rows (matched by the demov2_ email marker) then reseeds.
--  Requires : the New School schema/migrations already applied
--             (db/update.sql + db/add-judge-scoring.sql +
--              db/add-215-scoring.sql + db/add-judge-workflow.sql).
--  Login    : every seeded account uses password  demo1234
--             judge    -> demov2_judge@frantzcoutard.local
--             students -> demov2_student1 / 2 / 3 @frantzcoutard.local
-- =====================================================================

SET @pw := '$2y$10$agcvTp2DQ5TRgTS/O.TQl.aFRunFlZxwK.L4sfexo5Ang/keRZDBS';

-- ---------------------------------------------------------------------
-- 1. Clean up any previous v2 demo rows (children first)
-- ---------------------------------------------------------------------
DELETE FROM new_school_judge_scores      WHERE submission_id IN (SELECT id FROM new_school_submissions WHERE student_id IN (SELECT id FROM new_school_students WHERE email LIKE 'demov2_%@frantzcoutard.local'));
DELETE FROM new_school_judge_assignments WHERE submission_id IN (SELECT id FROM new_school_submissions WHERE student_id IN (SELECT id FROM new_school_students WHERE email LIKE 'demov2_%@frantzcoutard.local'));
DELETE FROM new_school_supporting_materials WHERE student_id IN (SELECT id FROM new_school_students WHERE email LIKE 'demov2_%@frantzcoutard.local');
DELETE FROM new_school_business_interviews  WHERE student_id IN (SELECT id FROM new_school_students WHERE email LIKE 'demov2_%@frantzcoutard.local');
DELETE FROM new_school_submissions          WHERE student_id IN (SELECT id FROM new_school_students WHERE email LIKE 'demov2_%@frantzcoutard.local');
DELETE FROM new_school_parents              WHERE student_id IN (SELECT id FROM new_school_students WHERE email LIKE 'demov2_%@frantzcoutard.local');
DELETE FROM new_school_students  WHERE email LIKE 'demov2_%@frantzcoutard.local';
DELETE FROM new_school_teachers  WHERE school_email LIKE 'demov2_%@frantzcoutard.local';
DELETE FROM new_school_schools   WHERE administrator_email LIKE 'demov2_%@frantzcoutard.local';
DELETE FROM new_school_judges    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'demov2_%@frantzcoutard.local');
DELETE FROM users WHERE email LIKE 'demov2_%@frantzcoutard.local';

-- ---------------------------------------------------------------------
-- 2. Shared school (principal)
-- ---------------------------------------------------------------------
INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Demo V2 Principal','demov2_school@frantzcoutard.local',@pw,'school','approved',NOW());
SET @schooluid := LAST_INSERT_ID();
INSERT INTO new_school_schools (user_id,school_name,school_address,school_district,main_phone,principal_name,administrator_name,administrator_email,administrator_phone,status)
VALUES (@schooluid,'Riverside STEM Academy','88 Riverside Blvd, Yonkers NY','Westchester District','9145550200','Dr. Alicia Moreno','Front Office','demov2_school@frantzcoutard.local','9145550200','approved');
SET @schoolid := LAST_INSERT_ID();

-- ---------------------------------------------------------------------
-- 3. Shared teacher
-- ---------------------------------------------------------------------
INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Demo V2 Teacher','demov2_teacher@frantzcoutard.local',@pw,'teacher','approved',NOW());
SET @teacheruid := LAST_INSERT_ID();
INSERT INTO new_school_teachers (user_id,school_id,teacher_full_name,school_email,phone_number,role_department,grade_level_supported,status)
VALUES (@teacheruid,@schoolid,'Mr. Jordan Blake','demov2_teacher@frantzcoutard.local','9145550201','Business & Entrepreneurship','11','approved');
SET @teacherid := LAST_INSERT_ID();

-- ---------------------------------------------------------------------
-- 4. Judge account (log in here to test the Judge dashboard)
-- ---------------------------------------------------------------------
INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Demo V2 Judge','demov2_judge@frantzcoutard.local',@pw,'judge','approved',NOW());
SET @judgeuid := LAST_INSERT_ID();
INSERT INTO new_school_judges (user_id,display_name) VALUES (@judgeuid,'Demo V2 Judge');

-- =====================================================================
--  STUDENT 1  --  Meera Kapoor  (DEMOV2A)  --  Bakery / Fresh Today kit
-- =====================================================================
INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Meera Kapoor','demov2_student1@frantzcoutard.local',@pw,'student','approved',NOW());
SET @stuuid := LAST_INSERT_ID();
INSERT INTO new_school_students
(user_id,school_id,teacher_id,participant_id,qr_token,qr_url,full_name,student_username,age,date_of_birth,email,phone_number,home_address,school_name,grade_level,parent_name,parent_phone,parent_email,parent_consent_status,school_approval_status,teacher_approval_status,submission_status,overall_status)
VALUES
(@stuuid,@schoolid,@teacherid,'DEMOV2A',CONCAT('demov2tokA',@stuuid),'/x','Meera Kapoor','meera_demo',17,'2008-09-14','demov2_student1@frantzcoutard.local','9145550202','23 Palisade Ave, Yonkers NY','Riverside STEM Academy','11th Grade','Sunita Kapoor','9145550203','demov2_parent1@frantzcoutard.local','approved','approved','approved','submitted','submission_submitted');
SET @sid := LAST_INSERT_ID();

INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Sunita Kapoor','demov2_parent1@frantzcoutard.local',@pw,'parent','approved',NOW());
SET @parentuid := LAST_INSERT_ID();
INSERT INTO new_school_parents (user_id,student_id,parent_full_name,relationship_to_student,phone_number,email,home_address,consent_checked,digital_signature,link_status)
VALUES (@parentuid,@sid,'Sunita Kapoor','Mother','9145550203','demov2_parent1@frantzcoutard.local','23 Palisade Ave, Yonkers NY',1,'Sunita Kapoor','approved');

INSERT INTO new_school_business_interviews
(student_id,visit_number,business_name,owner_name,business_phone,business_address,business_category,date_of_visit,has_website,has_google_profile,uses_social_media,uses_digital_signage,offers_rewards,has_online_ordering,has_delivery_options,main_challenge,student_notes,signature)
VALUES
(@sid,1,'Palisade Corner Bakery','Gina DeLuca','9145551001','12 Palisade Ave, Yonkers','Bakery','2026-05-04',0,1,0,0,0,0,0,'The bakery does wonderful work but is almost invisible online. Its Google hours are wrong, it has no social media, and orders are tracked on paper notes that often get lost.','My focus business. Gina is open to change but has no time to learn tools. She loses unsold bread every afternoon and gets no pre-orders.','Gina DeLuca'),
(@sid,2,'Riverside Barber Co.','Andre Cole','9145551002','19 Palisade Ave, Yonkers','Barber Shop','2026-05-06',0,1,1,0,0,0,0,'The phone rings during haircuts so calls go unanswered and walk-ins leave when the wait looks long.','Andre would try a simple online booking link and a queue display.','Andre Cole'),
(@sid,3,'Green Sprout Grocer','Hana Kim','9145551003','27 Palisade Ave, Yonkers','Grocery','2026-05-08',0,1,0,0,1,0,1,'Weekly produce deals are only on an inside chalkboard, so neighbors never learn about them until they walk in.','Hana wastes fresh produce each week and liked a text specials list.','Hana Kim'),
(@sid,4,'QuickFix Electronics','Diego Ramos','9145551004','33 Palisade Ave, Yonkers','Repair','2026-05-11',1,0,0,0,0,0,0,'Customers do not trust an unknown shop with their devices; there are almost no online reviews.','Great technician, only three reviews. Would ask for reviews with a QR card.','Diego Ramos'),
(@sid,5,'Peak Form Gym','Tanya Ford','9145551005','41 Palisade Ave, Yonkers','Fitness','2026-05-13',1,1,1,0,1,0,0,'Members join in January and quit by March; there is no follow-up to keep them coming.','Class schedule is not online. A streak reward could lift retention.','Tanya Ford'),
(@sid,6,'Chapter One Books','Nadia Rahman','9145551006','48 Palisade Ave, Yonkers','Books','2026-05-15',0,1,0,0,0,0,0,'Foot traffic dropped as readers buy online; events are never announced.','Hosts a kids story hour almost nobody knows about.','Nadia Rahman'),
(@sid,7,'Paws and Claws Pet Shop','Omar Said','9145551007','55 Palisade Ave, Yonkers','Pet Supply','2026-05-18',0,1,1,0,1,0,1,'No reorder reminders, so customers drift to online subscription boxes.','A loyalty punch and a monthly reminder could keep them local.','Omar Said'),
(@sid,8,'Ridgeway Auto Service','Frank Russo','9145551008','62 Palisade Ave, Yonkers','Automotive','2026-05-20',0,0,0,0,0,0,0,'Slow winter months and no way to remind customers when service is due.','Everything is on paper. Service-reminder texts could help.','Frank Russo'),
(@sid,9,'Sugar and Spice Cafe','Aisha Noor','9145551009','70 Palisade Ave, Yonkers','Cafe','2026-05-22',1,1,1,0,0,1,1,'Strong morning rush but empty afternoons; the online menu is outdated.','Promoting afternoon pre-orders could fill the quiet hours.','Aisha Noor'),
(@sid,10,'Bloom Florist','Elena Petrova','9145551010','78 Palisade Ave, Yonkers','Florist','2026-05-25',0,1,1,0,0,0,1,'Busy only around holidays; no way to capture everyday occasions.','A reminder sign-up for special dates could add repeat buyers.','Elena Petrova');

SET @b1 := (SELECT id FROM new_school_business_interviews WHERE student_id=@sid AND visit_number=1 LIMIT 1);

INSERT INTO new_school_submissions
(student_id,source_business_id,problem_identified,why_it_matters,proposed_solution,how_it_helps,expected_impact,video_url,written_url,ai_note,community_note,status,submission_date)
VALUES
(@sid,@b1,
 'Over eight weeks I interviewed ten small businesses along Palisade Avenue in Yonkers, and the same problem appeared at almost every stop: these shops do excellent work in person but are nearly invisible online. My focus business, Palisade Corner Bakery, is a perfect example. Its hours are wrong on Google, it has no social media at all, and customer orders are still tracked on paper sticky notes behind the counter. People who search for a bakery nearby simply never find it, and the few who do are not even sure it is open.',
 'When a loved neighborhood bakery cannot be found online, it slowly loses customers to large chains even though its bread is fresher and its prices are fair. That means less income for the DeLuca family, fewer part-time jobs for students like me, and a Palisade Avenue that feels emptier every year. Fixing this is not about expensive technology. It is about survival for a family business and about protecting the character of a street our whole community grew up with.',
 'I designed a free Fresh Today starter kit that a student and an owner can set up together in a single afternoon. It has four simple parts. First, claim and correct the Google Business Profile with the real hours, fresh photos, and a short menu. Second, build a one-page mobile-friendly site that lists the daily bakes and a phone number for pre-orders. Third, replace the paper order notes with a shared digital order sheet so nothing gets lost. Fourth, start a five-minute daily habit of posting one photo of what came out of the oven that morning.',
 'Each part attacks a specific gap I found during the interviews. Correcting the Google listing means people who search for a bakery near them finally see the shop with the right hours, which is the single largest source of brand-new walk-in customers. The pre-order sheet captures the office and school crowd that currently gives up when the phone line is busy. The daily photo keeps the bakery on peoples minds and turns social media from empty into active without costing a single dollar. Together they make the bakery easy to find, easy to order from, and easy to remember.',
 'If even three businesses on Palisade Avenue adopt this kit they can cross-promote one another, and the whole block becomes easier to discover, which keeps more spending local. For the bakery specifically I estimate recovering most of the wasted afternoon inventory through pre-orders and gaining steady repeat visits from the new online audience. Because every step is free and takes only minutes to maintain, the plan is realistic for a busy owner. Best of all it is a repeatable playbook that any student in any New York neighborhood could run.',
 '/api/uploads/new_school/demov2a-video.mp4','/api/uploads/new_school/demov2a-report.pdf',
 'I used an AI writing assistant only to tighten the grammar of this report and to brainstorm three sample social-media captions. Every business observation, the problem, and the four-part solution are entirely my own, based on my interviews.',
 'I organized a Saturday Love Palisade Avenue clean-up with fourteen classmates and five business owners. We cleared litter for three blocks, washed nine storefront windows, and handed out Fresh Today flyers.',
 'submitted', NOW());

INSERT INTO new_school_supporting_materials (student_id,material_type,file_url,original_name) VALUES
(@sid,'business_card','/api/uploads/new_school/demov2a-card.jpg','bakery-card.jpg'),
(@sid,'storefront_photo','/api/uploads/new_school/demov2a-storefront.jpg','storefront.jpg'),
(@sid,'website_screenshot','/api/uploads/new_school/demov2a-site.png','mockup-site.png'),
(@sid,'social_media_screenshot','/api/uploads/new_school/demov2a-social.png','instagram.png'),
(@sid,'flyer','/api/uploads/new_school/demov2a-flyer.pdf','fresh-today-flyer.pdf');

-- =====================================================================
--  STUDENT 2  --  Rohan Mehta  (DEMOV2B)  --  Barber / Book and Fill
-- =====================================================================
INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Rohan Mehta','demov2_student2@frantzcoutard.local',@pw,'student','approved',NOW());
SET @stuuid := LAST_INSERT_ID();
INSERT INTO new_school_students
(user_id,school_id,teacher_id,participant_id,qr_token,qr_url,full_name,student_username,age,date_of_birth,email,phone_number,home_address,school_name,grade_level,parent_name,parent_phone,parent_email,parent_consent_status,school_approval_status,teacher_approval_status,submission_status,overall_status)
VALUES
(@stuuid,@schoolid,@teacherid,'DEMOV2B',CONCAT('demov2tokB',@stuuid),'/x','Rohan Mehta','rohan_demo',16,'2009-02-20','demov2_student2@frantzcoutard.local','9145550212','14 Main St, New Rochelle NY','Riverside STEM Academy','10th Grade','Anil Mehta','9145550213','demov2_parent2@frantzcoutard.local','approved','approved','approved','submitted','submission_submitted');
SET @sid := LAST_INSERT_ID();

INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Anil Mehta','demov2_parent2@frantzcoutard.local',@pw,'parent','approved',NOW());
SET @parentuid := LAST_INSERT_ID();
INSERT INTO new_school_parents (user_id,student_id,parent_full_name,relationship_to_student,phone_number,email,home_address,consent_checked,digital_signature,link_status)
VALUES (@parentuid,@sid,'Anil Mehta','Father','9145550213','demov2_parent2@frantzcoutard.local','14 Main St, New Rochelle NY',1,'Anil Mehta','approved');

INSERT INTO new_school_business_interviews
(student_id,visit_number,business_name,owner_name,business_phone,business_address,business_category,date_of_visit,has_website,has_google_profile,uses_social_media,uses_digital_signage,offers_rewards,has_online_ordering,has_delivery_options,main_challenge,student_notes,signature)
VALUES
(@sid,1,'Main Street Barber Lounge','Marcus Bell','9145552001','8 Main St, New Rochelle','Barber Shop','2026-05-05',0,1,1,0,0,0,0,'Saturdays are packed while Tuesdays and Wednesdays are almost empty, and the phone goes unanswered during cuts so booking calls are simply lost.','My focus business. Marcus wants to smooth out the week and stop missing calls, but has no booking system at all.','Marcus Bell'),
(@sid,2,'Nonnas Pizzeria','Gio Ferraro','9145552002','15 Main St, New Rochelle','Restaurant','2026-05-07',1,1,1,0,0,1,1,'Great food but online orders come through a costly third-party app that eats the margin.','Gio wants direct online ordering to avoid app fees.','Gio Ferraro'),
(@sid,3,'Bright Smile Dental','Priya Shah','9145552003','22 Main St, New Rochelle','Dental','2026-05-09',1,1,0,0,0,0,0,'Many no-shows because appointment reminders are made by hand and often skipped.','Automatic reminder texts would cut the no-show rate.','Priya Shah'),
(@sid,4,'Urban Threads Tailor','Kwame Mensah','9145552004','29 Main St, New Rochelle','Tailor','2026-05-11',0,1,0,0,0,0,0,'Customers forget pickup dates, so finished garments sit uncollected for weeks.','A simple ready-for-pickup text would clear the backlog.','Kwame Mensah'),
(@sid,5,'Cyclepath Bikes','Erin Walsh','9145552005','36 Main St, New Rochelle','Retail','2026-05-13',1,1,1,0,1,0,0,'Seasonal sales mean winters are dead with no way to keep customers engaged.','Off-season tune-up reminders could steady the income.','Erin Walsh'),
(@sid,6,'Cup and Saucer Diner','Rosa Lin','9145552006','43 Main St, New Rochelle','Diner','2026-05-15',0,1,1,0,1,0,1,'Loyal regulars but no way to reach them when business is slow.','A simple text club for daily specials could help.','Rosa Lin'),
(@sid,7,'Pixel Print Shop','Sam Ortega','9145552007','50 Main St, New Rochelle','Printing','2026-05-18',1,0,0,0,0,1,0,'Quote requests come by phone and get lost on scattered notes.','An online quote form would organize the orders.','Sam Ortega'),
(@sid,8,'Harmony Music Lessons','Leah Cohen','9145552008','57 Main St, New Rochelle','Education','2026-05-20',1,1,1,0,0,0,0,'Scheduling lessons by phone tag wastes hours every week.','A shared booking calendar would save time.','Leah Cohen'),
(@sid,9,'Fresh Cuts Butcher','Tomas Novak','9145552009','64 Main St, New Rochelle','Butcher','2026-05-22',0,1,0,0,1,0,1,'Holiday orders overwhelm the counter with no pre-order system.','A pre-order sheet for holidays would reduce chaos.','Tomas Novak'),
(@sid,10,'Sole Mates Shoe Repair','Ahmed Farouk','9145552010','71 Main St, New Rochelle','Repair','2026-05-25',0,1,0,0,0,0,0,'Few people know the shop exists because it has no online presence.','Claiming a Google listing would bring in new walk-ins.','Ahmed Farouk');

SET @b1 := (SELECT id FROM new_school_business_interviews WHERE student_id=@sid AND visit_number=1 LIMIT 1);

INSERT INTO new_school_submissions
(student_id,source_business_id,problem_identified,why_it_matters,proposed_solution,how_it_helps,expected_impact,video_url,written_url,ai_note,community_note,status,submission_date)
VALUES
(@sid,@b1,
 'I interviewed ten appointment-based and service businesses on Main Street in New Rochelle, and one problem stood out over and over: unpredictable demand and lost bookings. My focus business, Main Street Barber Lounge, is jammed on Saturdays but nearly empty on Tuesdays and Wednesdays, and because the phone rings while barbers are mid-cut, booking calls simply go unanswered. Customers who cannot reach the shop or who see a long wait just walk down the street to a chain.',
 'For a small service business, an empty chair on a slow day is income that can never be recovered, and a missed phone call is often a customer lost for good. Marcus works long hours yet cannot plan his staffing because he has no idea who is coming. Steadier, more predictable demand would mean reliable pay for his barbers and a shop that can actually plan its week instead of lurching between chaos and silence.',
 'I built a plan called Book and Fill with four low-cost parts. First, a free online booking link customers can use any time, even while the barbers are busy. Second, a live wait-time board in the window and online so people know before they walk in. Third, automatic discount texts sent only for the slow Tuesday and Wednesday hours to pull demand into the gaps. Fourth, a small review-request card handed out at checkout to build trust with new customers.',
 'Each piece targets a gap I saw in the interviews. Online booking captures the calls that are lost during haircuts, which is where most bookings disappear today. The wait-time board stops frustrated walk-outs by setting expectations honestly. The slow-hour discount texts move willing customers from the packed Saturday into the empty midweek, flattening the peaks. The review card slowly builds the online trust that a shop with no reviews badly needs.',
 'I estimate the shop could fill a large share of its empty midweek chairs and stop losing the booking calls it misses today, which together would raise weekly income without adding a single hour. Steadier demand also lets Marcus schedule staff fairly. Because every tool is free or nearly free, the same Book and Fill plan could work for the dentist, the tailor, and the music teacher I interviewed, all of whom lose money to the exact same problem.',
 '/api/uploads/new_school/demov2b-video.mp4','/api/uploads/new_school/demov2b-report.pdf',
 'I used an AI assistant to help outline my report structure and to suggest wording for the discount text messages. The interviews, the problem, and the Book and Fill plan are my own work based on what the owners told me.',
 'I ran a Main Street Meetup where I helped four owners set up free Google Business listings in one afternoon, and I created a shared one-page guide they could follow on their own afterward.',
 'submitted', NOW());

INSERT INTO new_school_supporting_materials (student_id,material_type,file_url,original_name) VALUES
(@sid,'business_card','/api/uploads/new_school/demov2b-card.jpg','barber-card.jpg'),
(@sid,'photo','/api/uploads/new_school/demov2b-photo.jpg','interview-photo.jpg'),
(@sid,'storefront_photo','/api/uploads/new_school/demov2b-storefront.jpg','storefront.jpg'),
(@sid,'website_screenshot','/api/uploads/new_school/demov2b-site.png','booking-mockup.png'),
(@sid,'social_media_screenshot','/api/uploads/new_school/demov2b-social.png','review-card.png'),
(@sid,'flyer','/api/uploads/new_school/demov2b-flyer.pdf','book-and-fill.pdf');

-- =====================================================================
--  STUDENT 3  --  Layla Hassan  (DEMOV2C)  --  Grocery / Deals Near You
-- =====================================================================
INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Layla Hassan','demov2_student3@frantzcoutard.local',@pw,'student','approved',NOW());
SET @stuuid := LAST_INSERT_ID();
INSERT INTO new_school_students
(user_id,school_id,teacher_id,participant_id,qr_token,qr_url,full_name,student_username,age,date_of_birth,email,phone_number,home_address,school_name,grade_level,parent_name,parent_phone,parent_email,parent_consent_status,school_approval_status,teacher_approval_status,submission_status,overall_status)
VALUES
(@stuuid,@schoolid,@teacherid,'DEMOV2C',CONCAT('demov2tokC',@stuuid),'/x','Layla Hassan','layla_demo',17,'2008-11-30','demov2_student3@frantzcoutard.local','9145550222','5 Mamaroneck Ave, White Plains NY','Riverside STEM Academy','11th Grade','Yusuf Hassan','9145550223','demov2_parent3@frantzcoutard.local','approved','approved','approved','submitted','submission_submitted');
SET @sid := LAST_INSERT_ID();

INSERT INTO users (full_name,email,password_hash,role,approval_status,email_verified_at)
VALUES ('Yusuf Hassan','demov2_parent3@frantzcoutard.local',@pw,'parent','approved',NOW());
SET @parentuid := LAST_INSERT_ID();
INSERT INTO new_school_parents (user_id,student_id,parent_full_name,relationship_to_student,phone_number,email,home_address,consent_checked,digital_signature,link_status)
VALUES (@parentuid,@sid,'Yusuf Hassan','Father','9145550223','demov2_parent3@frantzcoutard.local','5 Mamaroneck Ave, White Plains NY',1,'Yusuf Hassan','approved');

INSERT INTO new_school_business_interviews
(student_id,visit_number,business_name,owner_name,business_phone,business_address,business_category,date_of_visit,has_website,has_google_profile,uses_social_media,uses_digital_signage,offers_rewards,has_online_ordering,has_delivery_options,main_challenge,student_notes,signature)
VALUES
(@sid,1,'Mamaroneck Fresh Market','Sofia Alvarez','9145553001','5 Mamaroneck Ave, White Plains','Grocery','2026-05-04',0,1,0,0,1,0,1,'A large amount of good produce is thrown out every week because there is no way to tell nearby shoppers about end-of-day markdowns, and the weekly deals only appear on a chalkboard inside the store.','My focus business. Sofia hates the waste and would love a cheap way to move fresh stock before it spoils.','Sofia Alvarez'),
(@sid,2,'Bloom and Petal Florist','Grace Oyelaran','9145553002','12 Mamaroneck Ave, White Plains','Florist','2026-05-06',0,1,1,0,0,0,1,'Fresh flowers wilt unsold midweek with no way to promote quick discounts.','Same-day deal alerts could sell flowers before they wilt.','Grace Oyelaran'),
(@sid,3,'The Daily Grind Coffee','Ben Carter','9145553003','19 Mamaroneck Ave, White Plains','Cafe','2026-05-08',1,1,1,0,1,1,0,'Pastries left at closing are simply binned every night.','A closing-time markdown alert could clear the case.','Ben Carter'),
(@sid,4,'Little Readers Bookshop','Mei Tan','9145553004','26 Mamaroneck Ave, White Plains','Books','2026-05-11',0,1,0,0,0,0,0,'Overstocked titles gather dust with no clearance channel.','A monthly bargain-shelf email could move old stock.','Mei Tan'),
(@sid,5,'FitZone Studio','Carla Mendez','9145553005','33 Mamaroneck Ave, White Plains','Fitness','2026-05-13',1,1,1,0,1,0,0,'Empty off-peak classes waste paid instructor time.','Off-peak flash deals could fill quiet classes.','Carla Mendez'),
(@sid,6,'Handy Hardware','Victor Popov','9145553006','40 Mamaroneck Ave, White Plains','Hardware','2026-05-15',0,1,0,0,0,0,1,'Seasonal items get marked down too late to sell.','Timely clearance alerts would cut leftover stock.','Victor Popov'),
(@sid,7,'Purrfect Pets','Nadia Aziz','9145553007','47 Mamaroneck Ave, White Plains','Pet Supply','2026-05-18',0,1,1,0,1,0,1,'Short-dated pet food is hard to sell before expiry.','A near-expiry deals list would reduce write-offs.','Nadia Aziz'),
(@sid,8,'Sunrise Laundromat','Hector Diaz','9145553008','54 Mamaroneck Ave, White Plains','Laundry','2026-05-20',0,1,0,0,0,0,0,'Machines sit idle midday with no way to attract customers.','Midday discount alerts could fill idle machines.','Hector Diaz'),
(@sid,9,'Sweet Tooth Bakery','Emma Wright','9145553009','61 Mamaroneck Ave, White Plains','Bakery','2026-05-22',0,1,1,0,0,1,1,'Day-old bread is discarded with no discount channel.','An end-of-day bread deal could cut daily waste.','Emma Wright'),
(@sid,10,'Tech Rescue Repair','Raj Malhotra','9145553010','68 Mamaroneck Ave, White Plains','Repair','2026-05-25',1,1,0,0,0,0,0,'Refurbished stock sits unsold with nowhere to advertise it.','A refurbished-deals post could clear the shelf.','Raj Malhotra');

SET @b1 := (SELECT id FROM new_school_business_interviews WHERE student_id=@sid AND visit_number=1 LIMIT 1);

INSERT INTO new_school_submissions
(student_id,source_business_id,problem_identified,why_it_matters,proposed_solution,how_it_helps,expected_impact,video_url,written_url,ai_note,community_note,status,submission_date)
VALUES
(@sid,@b1,
 'I interviewed ten shops along Mamaroneck Avenue in White Plains, and a single painful theme connected almost all of them: perfectly good stock is thrown away because there is no cheap, fast way to tell nearby shoppers about last-minute deals. My focus business, Mamaroneck Fresh Market, throws out a large amount of produce every week, and its weekly specials live only on a chalkboard inside the store where passers-by never see them. The waste is money in the bin and food that could have fed a family.',
 'Food and stock waste hurts twice. It drains the thin profit of a local grocer that is already squeezed by big chains, and it throws away food that neighbors in need could have used. When a store cannot clear perishable items in time, it either loses the money or raises prices on everything else to cover the loss. Cutting that waste keeps the grocer alive, keeps prices fair, and treats good food with the respect it deserves.',
 'I created a plan called Deals Near You with four simple, low-cost parts. First, a free text and email list neighbors can join to get that days specials. Second, an end-of-day markdown alert sent automatically for perishable items that must move before closing. Third, a window QR code that opens todays deals on a phone so walk-by shoppers can see them instantly. Fourth, a standing partnership with a local food pantry to collect unsold but still-good food at the end of each day.',
 'Each part attacks the waste at a different moment. The specials list finally lets the store reach shoppers before they buy elsewhere. The end-of-day markdown alert moves perishable stock in the final hours when it would otherwise be binned. The window QR converts foot traffic that walks right past today into buyers. And the pantry partnership rescues the food that still does not sell, so almost nothing edible is wasted and the community directly benefits.',
 'I estimate the market could sell a meaningful share of the perishable stock it currently discards and bring in new midweek shoppers through the deal alerts, while the pantry partnership turns unavoidable leftovers into meals instead of trash. Because the tools are free and the pantry link costs nothing, every shop I interviewed with the same waste problem could copy it. Deals Near You is a repeatable playbook that saves a business money and feeds the community at the same time.',
 '/api/uploads/new_school/demov2c-video.mp4','/api/uploads/new_school/demov2c-report.pdf',
 'I used an AI assistant to check my grammar and to help estimate rough waste figures from the numbers Sofia gave me. The interviews, the problem, and the Deals Near You plan are entirely my own work.',
 'I set up the first food-pantry pickup myself, arranging a weekly collection between Mamaroneck Fresh Market and a nearby community pantry, and I recruited three classmates to help sort donations each Friday.',
 'submitted', NOW());

INSERT INTO new_school_supporting_materials (student_id,material_type,file_url,original_name) VALUES
(@sid,'business_card','/api/uploads/new_school/demov2c-card.jpg','market-card.jpg'),
(@sid,'storefront_photo','/api/uploads/new_school/demov2c-storefront.jpg','storefront.jpg'),
(@sid,'website_screenshot','/api/uploads/new_school/demov2c-site.png','deals-mockup.png'),
(@sid,'flyer','/api/uploads/new_school/demov2c-flyer.pdf','deals-near-you.pdf');

-- ---------------------------------------------------------------------
-- Done. Log in as demov2_judge@frantzcoutard.local (demo1234), open the
-- Review Queue -> three projects appear (DEMOV2A / B / C). Score all
-- three to see averaging and the ranking table in the admin panel.
-- ---------------------------------------------------------------------
