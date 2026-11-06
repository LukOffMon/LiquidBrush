# Borra del bucket salt las canciones de miniminiexe y DustAct que ya estaban en Liquid (la otra copia sigue).
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
  'DustAct 101-171/170 - iza tkm, Berdu - sonando despierta.mp3'
)
$i = 0
foreach ($a in $archivos) {
  $i++
  Write-Host "[$i/$($archivos.Count)] $a"
  npx wrangler r2 object delete "$Bucket/$a" --remote
}
Write-Host 'Listo.'
