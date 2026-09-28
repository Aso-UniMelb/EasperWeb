<script>
  import LandingHeader from '../components/home/LandingHeader.svelte';
  import StartingPage from '../components/home/StartingPage.svelte';
  import LandingFooter from '../components/home/LandingFooter.svelte';
</script>

<div class="page-home-layout">
  <LandingHeader />
  <main class="page-home-content">
    <StartingPage />
  </main>
  <LandingFooter />
</div>

<style>
  .page-home-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .page-home-content {
    flex: 1;
    width: 100%;
  }
</style>
