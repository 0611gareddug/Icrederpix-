# 🎮 트랩빌더즈 (Trap Builders)

함정을 깔고, 그 함정을 피해 골인하는 2D 픽셀 파티 플랫포머 웹 게임입니다.
혼자서 AI 봇과 하거나, 방 코드로 친구들과 온라인 대전(최대 6명)을 할 수 있어요.

## 파일 구조
```
index.html        진입 페이지
game.min.js       난독화된 게임 코드 (빌드 결과물)
style.css         스타일 (빌드 결과물)
fonts/            갈무리 픽셀 글꼴 (OFL)
audio/bgm.mp3     배경음악
icon-*.png        아이콘, manifest.json  홈 화면 추가용
src/              원본 코드 (수정은 여기서)
build/            빌드 스크립트 (번들 + 난독화)
test/             헤드리스 테스트 (길찾기, 봇 매치)
docs/기획서.md     기획서
```

## 수정 후 다시 빌드하기
```bash
npm install
npm run build      # 배포용 (난독화)
npm run dev        # 개발용 (난독화 없음)
```

## 배포 (GitHub Pages)
저장소 Settings → Pages → Branch에서 이 파일들이 있는 브랜치와 `/ (root)`를 선택하면
`https://<사용자명>.github.io/<저장소명>/` 주소로 접속할 수 있어요.
