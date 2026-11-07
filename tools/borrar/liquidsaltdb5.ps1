# Borra del bucket salt las canciones de miniminiexe, DustAct y Blessme que ya estaban en Liquid (la otra copia sigue).
# Uso: npx wrangler login (con la cuenta de este bucket) y luego:
#   powershell -ExecutionPolicy Bypass -File .\liquidsaltdb5.ps1
param([string]$Bucket = 'liquidsaltdb5')
$archivos = @(
  'miniminiexe 001-084/007 - nusar3000, GIANNI BATISTA - GUARANA.mp3',
  'miniminiexe 001-084/010 - nusar3000, GIANNI BATISTA - nosesitukieres.mp3',
  'miniminiexe 001-084/020 - nusar3000, GIANNI BATISTA - PIZZA PLANET.mp3',
  'miniminiexe 001-084/024 - nusar3000, GIANNI BATISTA - FRANGO.mp3',
  'miniminiexe 001-084/025 - nusar3000 - TAUSERT.mp3',
  'miniminiexe 001-084/035 - nusar3000, Azuleja - SHEFTEK.mp3',
  'miniminiexe 001-084/039 - void, ta2cute, empireofyu - Bando.mp3',
  'miniminiexe 001-084/057 - void, empireofyu, ta2cute - DIAMONDS.mp3',
  'miniminiexe 001-084/058 - Harrykahanhai, void, ta2cute, empireofyu - Bando.mp3',
  'DustAct 001-100/075 - Maldita Vecindad Y Los Hijos Del 5to. Patio - Kumbala.mp3',
  'DustAct 001-100/090 - KAROL G, Judeline, rusowsky - BbY WOW.mp3',
  'DustAct 001-100/093 - rusowsky, Dinamarca - mwah 3.mp3',
  'DustAct 101-171/124 - rusowsky, DRUMMIE, Barry B - bla bla bla.mp3',
  'DustAct 101-171/141 - Lewis OfMan, Alicia te quiero - Siesta Freestyle.mp3',
  'DustAct 101-171/144 - The Marias - Lejos de Ti.mp3',
  'DustAct 101-171/145 - Bad Bunny, The Marias - Otro Atardecer.mp3',
  'DustAct 101-171/147 - PANTERA BLUE - Lagrima.mp3',
  'DustAct 101-171/151 - FLVCKKA - So what we get drunk - Extended Version.mp3',
  'DustAct 101-171/152 - Rauw Alejandro, Pharrell Williams - Committed.mp3',
  'DustAct 101-171/161 - Young Cister, Kreamly - QLOO.mp3',
  'DustAct 101-171/162 - PANTERA BLUE - Una fiesta de dos.mp3',
  'DustAct 101-171/168 - Alanis Yuki - Dimelo.mp3',
  'DustAct 101-171/170 - iza tkm, Berdu - sonando despierta.mp3',
  'Blessme 001-100/002 - Calvin Harris - Summer.mp3',
  'Blessme 001-100/009 - Calvin Harris, Ellie Goulding - Outside (feat. Ellie Goulding).mp3',
  'Blessme 001-100/010 - Coldplay - Adventure of a Lifetime.mp3',
  'Blessme 001-100/025 - Shakira, Rihanna - Can''t Remember to Forget You (feat. Rihanna).mp3',
  'Blessme 001-100/027 - C. Tangana - Mala Mujer.mp3',
  'Blessme 001-100/028 - C. Tangana, ROSALIA - Antes de Morirme - feat. ROSALIA.mp3',
  'Blessme 001-100/031 - ROSALIA - PIENSO EN TU MIRA - Cap.3 Celos.mp3',
  'Blessme 001-100/037 - Omar Courtz, De La Rose - Q U E V A S H A C E R H O Y.mp3',
  'Blessme 001-100/041 - C. Tangana, Mc Binn - Pa'' Llamar Tu Atencion (feat. Mc Binn).mp3',
  'Blessme 001-100/043 - Young Cister, Kreamly - QLOO.mp3',
  'Blessme 001-100/045 - Rels B - A Mi.mp3',
  'Blessme 001-100/058 - rusowsky - malibU.mp3',
  'Blessme 001-100/062 - Choclock, Cruzzi - Caprese.mp3',
  'Blessme 001-100/063 - Yung Beef - Si Saliste Remix.mp3',
  'Blessme 001-100/088 - Childish Gambino - Les.mp3',
  'Blessme 001-100/090 - Cris MJ, Kali Uchis, JHAYCO - SI NO ES CONTIGO - REMIX.mp3',
  'Blessme 001-100/092 - girl in red - we fell in love in october.mp3',
  'Blessme 001-100/099 - DannyLux - HOUSE OF LUX.mp3',
  'Blessme 001-100/100 - Micro TDH - Confianza.mp3',
  'Blessme 101-131/104 - Hector El Father , Wisin & Yandel - El Telefono.mp3',
  'Blessme 101-131/107 - Arcangel - Pa'' Que La Pases Bien.mp3',
  'Blessme 101-131/109 - Sleeping With Sirens - If I''m James Dean, You''re Audrey Hepburn.mp3',
  'Blessme 101-131/110 - Pierce The Veil - So Far So Fake.mp3',
  'Blessme 101-131/111 - Childish Gambino - Heartbeat.mp3',
  'Blessme 101-131/122 - Plan B - Por Que Te Demoras.mp3',
  'Blessme 101-131/123 - Tainy, Bad Bunny - MOJABI GHOST.mp3',
  'Blessme 101-131/127 - Bad Bunny, Jowell & Randy, Nengo Flow - Safaera.mp3',
  'Blessme 101-131/129 - Tony Dize, Yandel - Permitame.mp3'
)
$i = 0
foreach ($a in $archivos) {
  $i++
  Write-Host "[$i/$($archivos.Count)] $a"
  npx wrangler r2 object delete "$Bucket/$a" --remote
}
Write-Host 'Listo.'
