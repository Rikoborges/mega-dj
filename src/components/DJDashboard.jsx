import React from 'react';
import '../styles/DJDashboard.css';
import Deck from './Deck';
import Mixer from './Mixer';
import TrackLibrary from './TrackLibrary';
import SetlistQueue from './SetlistQueue';

export default function DJDashboard({
  deckA, deckB, activeDeck, isPlaying, progress, crossfader,
  library, setlist, isLoading, playerReady,
  onToggleA, onToggleB, onTransition, onCancelTransition, onCrossfaderChange,
  isTransitioning, transitionProgress, transitionDuration, onTransitionDurationChange,
  onLoadToDeck, onAddToSetlist, onRemoveFromSetlist, onMoveInSetlist,
  onSearch, onRecommend, onSavePlaylist,
  onHorn, onTec, onDrop, onScratch, onRiser, onSiren, onClap, onRewind,
}) {
  return (
    <div className="dj-dashboard">
      <div className="decks-row">
        <Deck
          label="DECK A" side="A"
          track={deckA}
          isActive={activeDeck === 'A'}
          isPlaying={isPlaying}
          progress={progress}
          playerReady={playerReady}
          onTogglePlay={onToggleA}
          onAddToSetlist={onAddToSetlist}
          onRecommend={onRecommend}
        />
        <Mixer
          deckA={deckA} deckB={deckB}
          activeDeck={activeDeck}
          isPlaying={isPlaying}
          crossfader={crossfader}
          onCrossfaderChange={onCrossfaderChange}
          onTransition={onTransition}
          onCancelTransition={onCancelTransition}
          isTransitioning={isTransitioning}
          transitionProgress={transitionProgress}
          transitionDuration={transitionDuration}
          onTransitionDurationChange={onTransitionDurationChange}
          onHorn={onHorn}
          onTec={onTec}
          onDrop={onDrop}
          onScratch={onScratch}
          onRiser={onRiser}
          onSiren={onSiren}
          onClap={onClap}
          onRewind={onRewind}
        />
        <Deck
          label="DECK B" side="B"
          track={deckB}
          isActive={activeDeck === 'B'}
          isPlaying={isPlaying}
          progress={progress}
          playerReady={playerReady}
          onTogglePlay={onToggleB}
          onAddToSetlist={onAddToSetlist}
          onRecommend={onRecommend}
        />
      </div>

      <div className="bottom-row">
        <TrackLibrary
          tracks={library}
          isLoading={isLoading}
          deckA={deckA} deckB={deckB}
          onSearch={onSearch}
          onLoadToDeck={onLoadToDeck}
          onAddToSetlist={onAddToSetlist}
        />
        <SetlistQueue
          tracks={setlist}
          onRemove={onRemoveFromSetlist}
          onMove={onMoveInSetlist}
          onLoadToDeck={onLoadToDeck}
          onSavePlaylist={onSavePlaylist}
        />
      </div>
    </div>
  );
}
