<script>
  import Header from '../components/Header.svelte';
  import LexiconManager from '../components/lexicon/LexiconManager.svelte';
</script>

<Header />

<div class="page-container page-lexicons">
  <LexiconManager />
</div>

<style>
  .page-lexicons {
    max-width: 1400px;
    margin: 0 auto;
    padding: 12px 16px 40px 16px;
    width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 768px) {
    .page-lexicons {
      padding: 12px 12px 32px;
    }
  }
</style>
