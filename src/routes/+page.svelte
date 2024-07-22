<script lang="ts">
	import * as furby from '$lib/furby'
    import { onMount } from 'svelte';
	import dlcs from '$lib/dlcs';
    import { ProgressBar } from '@skeletonlabs/skeleton';
	let connected = false
	let connecting = false
	let output: string[] = []
	let dlcButtons: {title: string,action: any}[] = []

	function connect(){
		if (furby.isConnected) return
		console.log("Attempting connect")
		connecting = true
		furby.doConnect()
		connecting = false
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
			output = furby.output
		}
		window.requestAnimationFrame(onFrame)
		loadDLCIndex()
	})
</script>

<div class="block card card-hover p-4 w-1/4 aspect-square absolute left-5 top-1/2 -translate-y-1/2 overflow-y-auto">
	{#each output as str}
		<p>{str}</p>
	{/each}
</div>

<div class="block card card-hover p-4 w-1/4 aspect-square absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 flex justify-center">
	{#if !connected}
	<div class="space-y-5 flex flex-col justify-center">
		<h1 class="h1">Crazy furble!</h1>
		<p class="text-center">activate the crazy furble :)</p>
		<button class="btn variant-filled-primary" on:click={connect}>Connect</button>
		{#if connecting}
		<ProgressBar value={undefined} />
		{/if}
	</div>
	{:else}
	{#if dlcButtons.length == 0}
	<div class="space-y-5 flex flex-col justify-center">
		<h1 class="h1">Select DLC!</h1>
		<section>
			{#each Object.entries(furby.dlcdata) as [file,data]}
			<button class="btn variant-filled-secondary" on:click={async () => {
				console.log("Run",file)
				await furby.fetchAndUploadDLC('dlcs/'+file);
				dlcButtons = data.buttons
			}}>{data.title}</button>
			{/each}
		</section>
	</div>
	{:else}
	<div class="space-y-5 flex flex-col justify-center">
		<h1 class="h1">Control him!</h1>
		<button class="btn variant-filled-secondary" on:click={async () => {
			dlcButtons = []
		}}>Back</button>
		<section>
			{#each dlcButtons as button}
			<button class="btn variant-filled-secondary" on:click={async () => {
				console.log("Action",button.title,button.action)
				furby.triggerAction.apply(null, button.action)
			}}>{button.title}</button>
			{/each}
		</section>
	</div>
	{/if}
	{/if}
</div>

<!-- <div class="container h-full mx-auto flex justify-center items-center">
	<div class="space-y-5">
		<h1 class="h1">Crazy furby!</h1>
		<p>Ben Glenn:</p>
		<section>
			<button class="btn variant-filled-primary" style="--opacity: {connected?0.5:1};" on:click={connect}>Connect</button>
		</section>
		{#if connecting}
		<ProgressBar value={undefined} />
		{/if}
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
</div> -->