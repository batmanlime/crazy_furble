<script lang="ts">
	import * as furby from '$lib/furby'
	function connect(){
		if (furby.isConnected) return
		console.log("Attempting connect")
		furby.doConnect()
	}
</script>

<div class="container h-full mx-auto flex justify-center items-center">
	<div class="space-y-5">
		<h1 class="h1">Crazy furby!</h1>
		<p>Ben Glenn:</p>
		<section>
			<button class="btn variant-filled-primary" style="--opacity: {furby.isConnected?0.5:1};" on:click={connect}>Connect</button>
		</section>
	</div>
</div>
