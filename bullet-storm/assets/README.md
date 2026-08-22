# 섀도우 룬 - 그래픽 에셋 교체 가이드

이 폴더에 아래 이름으로 PNG 파일을 넣으면 **자동으로 적용**됩니다.
파일이 없으면 게임에 내장된 도트 그림으로 자동 대체되므로,
**하나씩 넣으면서 점진적으로 교체**할 수 있습니다. (코드 수정 불필요)

## GIF 파일은 쓰지 마세요

받으신 팩의 GIF는 "이 에셋이 어떻게 움직이는지" 보여주는 **미리보기용**입니다.
캔버스 게임에서 GIF를 그리면 **첫 프레임만 정지 이미지로** 나옵니다.
애니메이션을 쓰려면 여러 동작이 격자로 담긴 **PNG(스프라이트 시트)** 를 써야 합니다.

## 스프라이트 시트 설정하기

여러 동작이 한 장에 담긴 PNG는 그냥 넣으면 캐릭터들이 뭉개져 보입니다.
어느 칸을 쓸지 알려줘야 해요.

### 1단계 — 숫자 알아내기

같은 폴더의 **`spritesheet-tool.html`** 을 브라우저로 열고 PNG를 끌어다 놓으세요.
격자와 행 번호가 표시되고, 오른쪽에서 애니메이션 미리보기를 볼 수 있습니다.
원하는 동작이 나올 때까지 `행(row)` 값을 바꿔보세요.

### 2단계 — 게임에 넣기

`index.html` 안의 `ASSET_SHEET` 부분을 도구가 알려준 값으로 수정합니다.

```js
const ASSET_SHEET = {
  hero:        { fw:16, fh:16, row:1, col0:0, frames:4, fps:7 },
  enemy_bat:   { fw:16, fh:16, row:0, col0:0, frames:4, fps:8 },
  enemy_ghost: { fw:16, fh:16, row:0, col0:0, frames:4, fps:6 },
  enemy_demon: { fw:16, fh:16, row:0, col0:0, frames:4, fps:5 }
};
```

- `fw`, `fh` — 프레임 한 칸 크기 (Ninja Adventure는 **16, 16**)
- `row` — 사용할 행. Ninja Adventure 캐릭터는 보통 **0=아래보기, 1=위보기, 2=왼쪽, 3=오른쪽**
  - 이 게임은 위로 올라가는 종스크롤이라 주인공은 **`row:1`(위보기)**, 적은 **`row:0`(아래보기)** 이 자연스럽습니다
- `frames` — 재생할 프레임 수 (보통 4)
- `fps` — 빠를수록 다급해 보입니다

**애니메이션이 필요 없는 단일 이미지**(아이템, 탄환 등)는 `ASSET_SHEET`에서 그 줄을 지우면
이미지 전체를 그대로 그립니다.

---

## 넣어야 할 파일 이름

| 파일명 | 용도 | 권장 크기 |
|---|---|---|
| `hero.png` | 주인공 캐릭터 | 32~64px 정사각 |
| `enemy_bat.png` | 박쥐 (약한 적) | 32~64px |
| `enemy_ghost.png` | 유령 (중간 적) | 32~64px |
| `enemy_demon.png` | 악마 (강한 적) | 48~96px |
| `bullet_player.png` | 내 공격 (수리검) | 16~32px |
| `bullet_wave.png` | 강화 공격 (장풍) | 24~48px |
| `bullet_enemy.png` | 적 탄환 | 16~32px |
| `item_rune.png` | 룬 조각 (파워업) | 24~48px |
| `item_coin.png` | 금화 | 24~48px |
| `tile_wasteland.png` | 1지역 황야 바닥 | 이어붙는(seamless) 타일 |
| `tile_forest.png` | 2지역 숲 바닥 | 이어붙는 타일 |
| `tile_snow.png` | 3지역 설산 바닥 | 이어붙는 타일 |
| `tile_magma.png` | 4지역 용암굴 바닥 | 이어붙는 타일 |
| `tile_abyss.png` | 5지역 심해 바닥 | 이어붙는 타일 |

- **배경은 위아래로 이어붙는(seamless/tileable) 이미지**여야 스크롤이 자연스럽습니다.
- 캐릭터는 배경이 **투명(알파 채널)** 인 PNG를 쓰세요.
- 이미지 비율은 자동 유지되며, 화면 표시 크기는 코드가 알아서 맞춥니다.

## 크기를 바꾸고 싶다면

`index.html` 안의 `ASSET_SIZE` 값을 조절하세요 (단위: 화면상 가로 픽셀).

```js
const ASSET_SIZE = {
  hero:34, enemy_bat:34, enemy_ghost:30, enemy_demon:42, ...
};
```

## 추천 무료 에셋 (모두 상용 이용 가능)

### 1. Ninja Adventure Asset Pack — CC0
https://pixel-boy.itch.io/ninja-adventure-asset-pack
- 닌자 주인공 + 다양한 몬스터 + 숲/사막/설산 타일셋
- 이 게임 컨셉(수리검 던지는 술사)과 가장 잘 맞습니다
- CC0: 출처 표기 없이 상업적 이용 가능

### 2. Kenney - Pixel Shmup — CC0
https://kenney-assets.itch.io/pixel-shmup
- 종스크롤 슈팅 전용 팩 (지형 타일, 탄환, UI 포함)
- 배경 타일과 탄환 그래픽을 여기서 가져오면 좋습니다

### 3. Kenney - Monster Builder Pack — CC0
https://kenney.nl/assets/monster-builder-pack
- 몬스터 170종 이상

### 4. 0x72 - DungeonTileset II — CC0
https://0x72.itch.io/dungeontileset-ii
- 던전 타일 + 애니메이션 몬스터

## 라이선스 주의사항

- **CC0** = 저작권 포기. 출처 표기 없이 상업적 이용·수정·재배포 모두 자유입니다.
  위에 적은 4개 팩은 모두 CC0로 표기되어 있습니다.
- 다만 **다운로드 시점에 각 페이지의 라이선스 표기를 반드시 직접 확인**하세요.
  제작자가 나중에 라이선스를 변경하는 경우가 있습니다.
- 광고를 붙여 수익이 발생하는 사이트도 "상업적 이용"에 해당하므로,
  CC0가 아닌 팩(예: "출처 표기 필수", "재판매 금지")을 쓸 경우
  해당 조건을 지켜야 합니다.
- 유료 팩이나 다른 게임에서 추출한 이미지는 절대 사용하지 마세요.
