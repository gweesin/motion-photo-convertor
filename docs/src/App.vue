<script setup lang="ts">
import { ref } from 'vue'
import { embedXMP, findPatternInUint8ArrayReverse, indexOfSubarrayOptimized } from './utils.ts'

const xmpEditor = ref<HTMLInputElement | null>(null)
const downloadUpdatedFile = ref<HTMLAnchorElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const msg = ref<string>('')
const videoSize = ref<number>(Number.NaN)
const hasXMP = ref<boolean>(false)
const hasExtraXMP = ref<boolean>(false)
const newVideoArray = ref<Uint8Array<ArrayBuffer>>(new Uint8Array(0))

async function changeFileEvent(event: Event) {
  const file = (event.target as HTMLInputElement).files![0]
  if (!file) {
    return
  }
  if (!file.name.endsWith('.jpg')) {
    // eslint-disable-next-line no-alert
    alert('请选择一个jpg格式的图片')
    return
  }
  hasXMP.value = false
  hasExtraXMP.value = false
  downloadUpdatedFile.value!.style.display = 'none'
  const arrayBuffer = await file.arrayBuffer()

  const uint8Array = new Uint8Array(arrayBuffer)
  const textDecoder = new TextDecoder()
  const fileString = textDecoder.decode(uint8Array)

  const xmpStart = fileString.indexOf('<x:xmpmeta')
  const xmpEnd = fileString.indexOf('</x:xmpmeta>') + 12
  // 查找小米可能出现的第二处xmp
  const extraXmpStart = fileString.indexOf('<x:xmpmeta', xmpEnd)
  const extraXmpEnd = fileString.indexOf('</x:xmpmeta>', xmpEnd) + 12
  if (extraXmpStart !== -1 && extraXmpEnd !== 11) {
    const extraXmpString = fileString.slice(extraXmpStart, extraXmpEnd)
    // 判断是否包含关键字
    if (extraXmpString.includes('MicroVideoOffset')) {
      hasExtraXMP.value = true
      // eslint-disable-next-line no-console
      console.log('发现第二处XMP: ', extraXmpString)
      // eslint-disable-next-line no-alert
      alert('已知问题：小米存在两段重复的XMP，在Exif所在的APP1内的修改造成Exif损坏，请等待后续修复后再使用！')
    }
  }
  const videoStart = indexOfSubarrayOptimized(uint8Array, new TextEncoder().encode('ftyp')) - 4
  if (videoStart !== -5) {
    videoSize.value = uint8Array.length - videoStart
  }

  if (xmpStart !== -1 && xmpEnd !== -1) {
    xmpEditor.value!.value = fileString.slice(xmpStart, xmpEnd)
    msg.value = 'XMP信息加载成功，需自行检查是否符合动态照片格式。'
    hasXMP.value = true
  }
  else {
    xmpEditor.value!.value = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.1.0-jc003">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:GCamera="http://ns.google.com/photos/1.0/camera/"
        xmlns:OpCamera="http://ns.oplus.com/photos/1.0/camera/"
        xmlns:MiCamera="http://ns.xiaomi.com/photos/1.0/camera/"
        xmlns:Container="http://ns.google.com/photos/1.0/container/"
        xmlns:Item="http://ns.google.com/photos/1.0/container/item/"
      GCamera:MotionPhoto="1"
      GCamera:MotionPhotoVersion="1"
      GCamera:MotionPhotoPresentationTimestampUs="0"
      OpCamera:MotionPhotoPrimaryPresentationTimestampUs="0"
      OpCamera:MotionPhotoOwner="oplus"
      OpCamera:OLivePhotoVersion="2"
      OpCamera:VideoLength="5417125"
      GCamera:MicroVideoVersion="1"
      GCamera:MicroVideo="1"
      GCamera:MicroVideoOffset="5417125"
      GCamera:MicroVideoPresentationTimestampUs="0"
      MiCamera:XMPMeta="&lt;?xml version='1.0' encoding='UTF-8' standalone='yes' ?&gt;">
      <Container:Directory>
        <rdf:Seq>
          <rdf:li rdf:parseType="Resource">
            <Container:Item
              Item:Mime="image/jpeg"
              Item:Semantic="Primary"
              Item:Length="0"
              Item:Padding="0"/>
          </rdf:li>
          <rdf:li rdf:parseType="Resource">
            <Container:Item
              Item:Mime="video/mp4"
              Item:Semantic="MotionPhoto"
              Item:Length="5417125"/>
          </rdf:li>
        </rdf:Seq>
      </Container:Directory>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`
    msg.value = '原图片未找到XMP信息，已填入预置模板（理论上支持谷歌/OPPO/小米）。'
  }
}

function xmpEditorInput() {
  downloadUpdatedFile.value!.style.display = 'none'
}

function autoFix() {
  const xmpEditorContent = xmpEditor.value!.value
  if (Number.isNaN(videoSize.value)) {
    // eslint-disable-next-line no-alert
    alert('请先上传视频文件再尝试修正偏移量！')
    return
  }
  // find OpCamera:VideoLength="..."/GCamera:MicroVideoOffset="..."/Item:Length="..."(after Item:Semantic="MotionPhoto")
  // replace ... with videoSize.value
  const regex = /OpCamera:VideoLength="(\d+)"/g
  let newXmpContent = xmpEditorContent.replace(regex, `OpCamera:VideoLength="${videoSize.value}"`)
  const regex2 = /GCamera:MicroVideoOffset="(\d+)"/g
  newXmpContent = newXmpContent.replace(regex2, `GCamera:MicroVideoOffset="${videoSize.value}"`)
  const regex3 = /Item:Semantic="MotionPhoto"((.|[\r\n])*?)Item:Length="(\d+)"/g
  newXmpContent = newXmpContent.replace(regex3, `Item:Semantic="MotionPhoto"$1Item:Length="${videoSize.value}"`)
  xmpEditor.value!.value = newXmpContent
}

async function gen() {
  const xmpEditorContent = xmpEditor.value!.value
  const originalFile = fileInput.value!.files![0]
  downloadUpdatedFile.value!.style.display = 'none'
  if (!originalFile) {
    // eslint-disable-next-line no-alert
    alert('请先选择一个图片！')
    return
  }
  if (!newVideoArray.value) {
    // eslint-disable-next-line no-alert
    alert('请先选择一个视频！')
    return
  }

  const originalArray = new Uint8Array(await originalFile.arrayBuffer())
  let xmpStart = 2
  let xmpEnd = 2
  let extraXmpStart = 0
  let extraXmpEnd = 0
  let updatedXmpArray = new TextEncoder().encode(xmpEditorContent)
  if (hasXMP.value) {
    xmpStart = indexOfSubarrayOptimized(originalArray, new TextEncoder().encode('<x:xmpmeta'))
    xmpEnd = indexOfSubarrayOptimized(originalArray, new TextEncoder().encode('</x:xmpmeta>')) + 12
    if (hasExtraXMP.value) {
      extraXmpStart = indexOfSubarrayOptimized(originalArray, new TextEncoder().encode('<x:xmpmeta'), true)
      extraXmpEnd = indexOfSubarrayOptimized(originalArray, new TextEncoder().encode('</x:xmpmeta>'), true) + 12
    }
  }
  else {
    // 原图片不包含XMP，需构建完整的APP1字段
    updatedXmpArray = embedXMP(xmpEditorContent)
  }
  let videoStart = indexOfSubarrayOptimized(originalArray, new TextEncoder().encode('ftyp')) - 4

  if (videoStart < 0) {
    // eslint-disable-next-line no-console
    console.log('已上传视频：未找到内嵌视频部分，尝试附加在末尾')
    videoStart = originalArray.length
  }
  if (newVideoArray.value.length === 0) {
    // eslint-disable-next-line no-console
    console.log('未上传新视频：保留原视频')
    videoStart = originalArray.length
  }

  // todo: MPF等本身包含偏移量的字段暂未考虑，仅考虑XMP所在的APP1字段，未考虑厂商额外增加的其他字段
  const extraXmpLength = hasExtraXMP.value ? updatedXmpArray.length : 0
  const updatedFileArray = new Uint8Array(videoStart + newVideoArray.value.length - xmpEnd + xmpStart + updatedXmpArray.length - extraXmpEnd + extraXmpStart + extraXmpLength)
  let raw_app1 = originalArray.slice(0, xmpStart)
  // 修正包含XMP的APP1字段头部长度标识
  const searchPattern = [0xFF, 0xE1]
  let app1_start = findPatternInUint8ArrayReverse(raw_app1, searchPattern)
  if (app1_start === -1) {
    // eslint-disable-next-line no-console
    console.log('已尝试创建包含XMP的APP1字段')
  }
  else {
    const originalLength = (raw_app1[app1_start + 2] << 8) | raw_app1[app1_start + 3]
    const n = updatedXmpArray.length - (xmpEnd - xmpStart)
    const newLength = originalLength + n
    raw_app1[app1_start + 2] = (newLength >> 8) & 0xFF
    raw_app1[app1_start + 3] = newLength & 0xFF
  }
  updatedFileArray.set(raw_app1)
  updatedFileArray.set(updatedXmpArray, xmpStart)
  if (hasExtraXMP.value) {
    // 处理小米第二处重复的XMP
    // eslint-disable-next-line no-console
    console.log(extraXmpStart, extraXmpEnd)
    raw_app1 = originalArray.slice(xmpEnd, extraXmpStart)
    app1_start = findPatternInUint8ArrayReverse(raw_app1, searchPattern)
    const originalLength = (raw_app1[app1_start + 2] << 8) | raw_app1[app1_start + 3]
    const n = updatedXmpArray.length - (extraXmpEnd - extraXmpStart)
    const newLength = originalLength + n
    raw_app1[app1_start + 2] = (newLength >> 8) & 0xFF
    raw_app1[app1_start + 3] = newLength & 0xFF
    updatedFileArray.set(raw_app1, xmpStart + updatedXmpArray.length)
    updatedFileArray.set(updatedXmpArray, extraXmpStart - xmpEnd + xmpStart + updatedXmpArray.length)
    updatedFileArray.set(originalArray.slice(extraXmpEnd, videoStart), extraXmpEnd + updatedXmpArray.length + extraXmpLength - (xmpEnd - xmpStart) - (extraXmpEnd - extraXmpStart))
    updatedFileArray.set(newVideoArray.value, videoStart + updatedXmpArray.length + extraXmpLength - (xmpEnd - xmpStart) - (extraXmpEnd - extraXmpStart))
  }
  else {
    updatedFileArray.set(originalArray.slice(xmpEnd, videoStart), xmpStart + updatedXmpArray.length)
    updatedFileArray.set(newVideoArray.value, videoStart - xmpEnd + xmpStart + updatedXmpArray.length)
  }

  const blob = new Blob([updatedFileArray])
  downloadUpdatedFile.value!.href = URL.createObjectURL(blob)
  downloadUpdatedFile.value!.download = 'updated_dynamic_photo.jpg'
  downloadUpdatedFile.value!.style.display = 'inline-block'

  msg.value = '文件更新成功！'
}

async function changeVideoInputEvent(event: Event) {
  const newVideoFile = (event.target as HTMLInputElement).files![0]
  if (!newVideoFile.name.endsWith('.mp4')) {
    // eslint-disable-next-line no-alert
    alert('请选择一个mp4格式的视频文件！')
    return
  }
  downloadUpdatedFile.value!.style.display = 'none'

  if (newVideoFile) {
    const arrayBuffer = await newVideoFile.arrayBuffer()
    newVideoArray.value = new Uint8Array(arrayBuffer)
    videoSize.value = arrayBuffer.byteLength
  }
}
</script>

<template>
  <header>
    <h1>合成动态照片</h1>
    <p>支持替换带XMP元数据的jpg格式动态照片内嵌的视频，如谷歌/OPPO/小米<br>支持普通图片合并视频转为实况 (测试中...)</p>
  </header>

  <main>
    <p style="color: red;">
      静态图+视频合成实况暂未完善，初步测试能被谷歌相册、Windows相册识别，其他厂商相册或三方软件的识别可能还需要适配其他字段。
    </p>
    <label for="fileInput">请选择一个图片 (.jpg)：</label>
    <input id="fileInput" ref="fileInput" type="file" accept=".jpg,.jpeg" @change="changeFileEvent">
    <p class="msg" />

    <label for="xmpEditor">XMP信息 (请根据视频长度修正偏移量)：</label>
    <a @click="autoFix">尝试自动修正</a>
    <textarea id="xmpEditor" ref="xmpEditor" placeholder="解析的XMP信息将在此处显示" @input="xmpEditorInput" />

    <label for="newVideoInput">请选择一个视频 (.mp4 可选，不上传则只编辑XMP)：</label>
    <input id="newVideoInput" type="file" accept=".mp4" @change="changeVideoInputEvent"><br>
    <label for="videoSize">视频长度：</label>
    <code id="videoSize">
      <template v-if="videoSize && !Number.isNaN(videoSize)">{{ videoSize }}</template>
      <template v-else>上传后自动解析</template>
    </code>
    <div>
      <button style="margin-top: 10px;" @click="gen">
        开始合成
      </button>
    </div>
    <a id="downloadUpdatedFile" ref="downloadUpdatedFile" style="display: none;">下载动态照片</a>
  </main>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  background-color: #f4f4f9;
  color: #333;
}

header {
  background-color: #262626;
  color: white;
  text-align: center;
  padding: 20px;
}

h1 {
  margin: 0;
}

main {
  margin: 20px;
  padding: 20px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

p {
  line-height: 1.6;
}

label {
  font-weight: bold;
  margin-bottom: 8px;
  display: inline-block;
}

input[type="file"] {
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #ccc;
}

textarea {
  width: 100%;
  height: 150px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  font-family: monospace;
}

a {
  margin-top: 10px;
  color: #4CAF50;
  text-decoration: none;
  font-weight: bold;
}

a:hover {
  text-decoration: underline;
}

.msg {
  font-size: 16px;
  font-weight: bold;
}

button {
  padding: 10px 20px;
  font-size: 16px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #45a049;
}

pre {
  background-color: #f1f1f1;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
  overflow-x: auto;
}
</style>
