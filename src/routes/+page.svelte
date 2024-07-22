<script lang="ts">
	import * as furby from '$lib/furby'
    import { onMount } from 'svelte';
	import dlcs from '$lib/dlcs';
	let connected = false
	let dlcButtons: {title: string,action: any}[] = []

	function connect(){
		if (furby.isConnected) return
		console.log("Attempting connect")
		furby.doConnect()
	}
	
	async function loadDLCIndex() {
		for (let dlc of dlcs) {
			let opt = document.createElement('option');
			if (dlc.file.length > 12) {
				console.log('DLC filename must be <= 12 chars, got ' + dlc.file);
			}
				
			furby.dlcdata[dlc.file] = dlc;
			/*opt.value = dlc.file;
			opt.textContent = dlc.title;
			dlcsel.appendChild(opt);*/
		}
	}

	onMount(() => {
		function onFrame() {
			window.requestAnimationFrame(onFrame)
			connected = furby.isConnected
		}
		window.requestAnimationFrame(onFrame)
		loadDLCIndex()
	})
</script>

<div class="container h-full mx-auto flex justify-center items-center">
	<div class="space-y-5">
		<h1 class="h1">Crazy furby!</h1>
		<p>Ben Glenn:</p>
		<section>
			<button class="btn variant-filled-primary" style="--opacity: {connected?0.5:1};" on:click={connect}>Connect</button>
		</section>
		{#if connected}
		<section>
			{#each Object.entries(furby.dlcdata) as [file,data]}
			<button class="btn variant-filled-secondary" on:click={async () => {
				console.log("Run",file)
				await furby.fetchAndUploadDLC('dlcs/'+file);
				dlcButtons = data.buttons
				//setupDLCButtons(params);
				//showSection('actions');
			}}>{data.title}</button>
			{/each}
		</section>
		<section>
			{#each dlcButtons as button}
			<button class="btn variant-filled-secondary" on:click={async () => {
				console.log("Action",button.title,button.action)
				furby.triggerAction.apply(null, button.action)
			}}>{button.title}</button>
			{/each}
		</section>
		{/if}
	</div>
</div>
