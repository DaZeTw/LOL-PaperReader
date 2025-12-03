# Page 1

This CVPR paper is the Open Access version, provided by the Computer Vision Foundation. Except for this watermark, it is identical to the accepted version; the final published version of the proceedings is available on IEEE Xplore.

## Prototype-Based Image Prompting for Weakly Supervised Histopathological Image Segmentation

Qingchen Tang * Lei Fan * Maurice Pagnucco Yang Song University of New South Wales

{ qingchen.tang@student, lei.fan1@, morri@cse, yang.song1@ } .unsw.edu.au

## Abstract

Weakly supervised image segmentation with image-level la- bels has drawn attention due to the high cost of pixel-level annotations. Traditional methods using Class Activation Maps (CAMs) often highlight only the most discriminative regions, leading to incomplete masks. Recent approaches that introduce textual information struggle with histopatho- logical images due to inter-class homogeneity and intra- class heterogeneity. In this paper, we propose a prototype- based image prompting framework for histopathological image segmentation. It constructs an image bank from the training set using clustering, extracting multiple prototype features per class to capture intra-class heterogeneity. By designing a matching loss between input features and class- specific prototypes using contrastive learning, our method addresses inter-class homogeneity and guides the model to generate more accurate CAMs. Experiments on four datasets (LUAD-HistoSeg, BCSS-WSSS, GCSS, and BCSS) show that our method outperforms existing weakly super- vised segmentation approaches, setting new benchmarks in histopathological image segmentation. 1

Figure 1. a. Four supervision frameworks for histopathologi- cal image segmentation: fully supervised with pixel-level masks, CAM-based WSS using image labels, textural-based WSS, and our image prompt-based framework. b. The challenges of inter- class homogeneity (variable texture and staining within classes) and intra-class heterogeneity (similar appearances across classes). Cosine similarities are computed using features extracted by the MedCLIP model [ 47 ].

sible labels such as bounding boxes [ 21 , 35 ], scribbles [ 29 ], point annotations [ 34 ], and image-level labels [ 56 , 57 ]. Typ- ically, WSS methods employ a two-stage process: a classifi- cation network is first trained using weak labels to generate pseudo-labels, such as class activation maps (CAMs) [ 59 ]. These pseudo-labels are then utilized as refined supervision signals to train a fully supervised network [ 17 , 57 , 59 ]. However, CAMs generated from image-level labels of- ten focus on the most discriminative regions, leading to in- complete localization of target objects and confusion be- tween target and non-target areas [ 23 , 50 ]. This limitation arises from a domain gap in pre-trained models, which are often trained on source domains ( e.g. , ImageNet [ 8 ]) that differ from the target domain ( e.g. , histopathology), caus- ing CAMs to focus on features misaligned with those of the target domain. Early studies have explored various strate- gies to improve CAM quality, such as pixel affinity mod- els [ 1 ] and saliency map integration [ 24 ]. Recent studies have utilized textual information to bridge the gap between image-level labels and pixel-level segmentation [ 9 , 50 , 57 ]. As illustrated in Figure 1 , these approaches incorporate tex- tual descriptions ( e.g. , object type, colour, structure) into

## 1. Introduction

Automated segmentation of histopathology images plays a crucial role in computer-aided diagnosis, assisting in the identification of abnormal tissue regions, quantification of tumor microenvironments [ 58 ], and the support of tu- mor grading and prognosis [ 11 – 14 , 51 ]. Existing meth- ods largely depend on extensive high-quality annotated data [ 28 , 30 , 41 ], while pixel-level annotations present par- ticular challenges due to the significant domain expertise and time required for their creation [ 15 , 33 , 62 ]. To reduce this requirement, weakly supervised segmentation (WSS) frameworks [ 20 , 56 , 57 ] have been proposed as a more label-efficient alternative, utilizing weak but easily acces-

* Equal contribution. 1 https://github.com/QingchenTang/PBIP

30271

![p1_img001](images/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p1-img001.png)

# Page 2

and inter-class homogeneity. • We design a CLIP-based image matching method that uses a contrastive learning approach to encourage the alignment of foreground features with their respec- tive prototypes while maintaining distance from non- target prototypes, enhancing pixel-level segmentation in weakly supervised tasks. • Extensive experiments on the LUAD-HistoSeg [ 17 ], BCSS-wsss [ 17 ], GCSS [ 39 ], and BCSS [ 2 ] demonstrate that our method outperforms the current state-of-the-art methods in weakly supervised tissue segmentation.

the model via pre-trained vision-language models, such as CLIP model [ 36 ]. While these methods have shown strong performance on popular segmentation benchmarks [ 9 , 50 ], they face chal- lenges in histopathological image segmentation. Tissue seg- mentation involves larger anatomical structures compared to general images or cell nucleus segmentation, with com- plex spatial arrangements, significant inter-class homogene- ity , and intra-class heterogeneity [ 6 , 25 ]. As illustrated in Figure 1 .b, inter-class homogeneity refers to the visual sim- ilarity between different tissue types, making it difficult to differentiate target regions from surrounding tissues. For in- stance, non-tumor tissues may closely resemble tumor tis- sues, causing CAM-based methods [ 3 , 17 ] to activate on irrelevant areas erroneously. Intra-class heterogeneity in- volves significant variability within the same tissue type, such as differences in staining, shape, and texture, which hampers text-based methods [ 9 , 50 , 57 ] from capturing fine- grained details, leading to misalignment between textual de- scriptions and pixel-level features. To address these challenges, we propose a Prototype- Based Image Prompting (PBIP) framework for WSS in histopathological segmentation. Unlike methods that rely on text prompts, we utilize image-level labels and their cor- responding images to construct visual prototypes. This ap- proach enables the model to discern nuanced visual varia- tions that are challenging for text-based methods. The vi- sual prototypes are achieved through a feature bank that serves as an additional supervisory signal to guide CAM refinement. More specifically, the PBIP framework con- sists of two main components: a classification network and a prototype-guided feature matching network. The clas- sification network, based on a pre-trained model, extracts multiscale feature representations from the query image to produce pseudo-segmentation masks that indicate class- specific pixel regions. The prototype-guided network con- structs a feature bank containing multiple prototypes for each tissue class to capture intra-class heterogeneity. The feature bank is constructed from the training set by orga- nizing images into distinct prototypes based on their labels and employing a CLIP-based image encoder to extract se- mantically rich, pixel-level features. In addition, a con- trastive learning-based similarity loss is computed between the prototypes and class-specific pixel regions, mitigating inter-class homogeneity and yielding high-precision CAMs in the first stage of WSS, which then serve as pseudo-labels for subsequent supervised training. The main contributions of this paper are as follows: • To the best of our knowledge, the proposed PBIP frame- work is the first WSS model in the histopathology do- main that utilizes image prompts. By integrating a prototype-guided feature prompting mechanism through an image library, it addresses intra-class heterogeneity

## 2. Related Work

## 2.1. Weakly Supervised Segmentation

WSS methods aim to infer pixel-level segmentation from simpler labels such as image-level classification tags [ 7 , 33 ], bounding boxes [ 22 ], or point annotations [ 16 , 53 ]. Sub- sequent research has focused on generating higher-quality pseudo labels from these weak annotations, leading to the development of numerous CAM-based approaches [ 43 , 46 ], such as the Grad-CAM model [ 37 ], pixel affinity mod- els [ 1 ], and saliency maps [ 24 ]. These CAM-based models have been used in early histopathological image segmen- tation studies, including HistoSegNet [ 3 ], OEEN [ 26 ], and the MLPS model [ 17 ]. With advances in multimodal learning [ 40 , 44 ], particu- larly the development of CLIP [ 36 ], which effectively aligns image and text embeddings, recent studies have incorpo- rated textual information as additional supervision to re- duce the discrepancy between image-level labels and pixel- level predictions in WSS. For instance, Xie et al . proposed CLIMS [ 50 ] and Deng et al . introduced QA-CLIMS [ 9 ], integrating textual information into WSS models using the pre-trained CLIP model [ 36 ]. In histopathological image segmentation, Zhang et al . proposed TPRO [ 57 ], which in- corporates general descriptions of tissue characteristics into image features via an attention mechanism [ 42 ] to produce more accurate CAMs by aligning image features with tex- tual descriptions. In contrast, our method utilizes image- level labels and the corresponding images to provide finer- grained guidance compared to text-based approaches, ad- dressing the challenges of homogeneity and heterogeneity in histopathological images.

## 2.2. Prompt Learning

Prompt learning initially gained traction in Natural Lan- guage Processing (NLP) [ 10 , 27 ], where models were guided in specific tasks through designed or learned prompts. With the rise of large-scale pre-trained multi- modal models like CLIP [ 36 ], prompt engineering has ex- tended to vision tasks [ 60 , 61 ]. Early approaches relied on manually defined text templates ( e.g ., “a photo of { class

30272

# Page 3

name } ”) to describe classes of interest and extract relevant knowledge [ 9 , 50 ]. However, this trial-and-error process is time-consuming and requires specific expertise. To address these limitations, learnable prompt-based methods were introduced for vision tasks [ 52 , 60 ], replacing manual templates with a set of learnable text vectors pre- ceding class names, thus automating the prompt generation process [ 60 ]. Additionally, some methods attempted to in- troduce image prompts through prototypes for few-shot im- age tasks [ 18 , 48 ]. For example, Wang et al . [ 45 ] and Shen et al . [ 38 ] effectively utilized image prototypes for few-shot image segmentation. In our method, we leverage prototype-based image prompts instead of text-based prompts. These image prompts offer finer-grained and more direct guidance, al- lowing the model to capture subtle visual differences that are challenging to describe using text alone.

based on image-level labels that indicate the patch contains only one class (e.g., only tumor) and exclude images with excessive white regions automatically. These patches are grouped into N categories corresponding to the N classes in the dataset. To capture intra-class heterogeneity, K -Means clustering is applied within each category to partition the patches into K subcategories. For each subcategory, the top N K images closest to the cluster center are selected as pro- totypes for the image bank. The distance metric used for clustering is defined as:

D _ t ( x _ 1 , x _ 2 ) = 1 - \ f r a c { \ p h i _ e ( x _ 1 ) \cdot \phi _e(x_2)}{\|\phi _e(x_1)\| \|\phi _e(x_2)\|}, (1)

where x 1 and x 2 are two image patches, ϕ e denotes the fea- ture extraction function of the CLIP image encoder, and the symbol · denotes the dot product operation between vec- tors. This process results in an image bank comprising N classes, each containing K subcategories, with each subcat- egory holding N K representative images.

## 3. Method

## 3.1. Overview

## 3.3. Classification Network

The key idea of our proposed PBIP framework is to lever- age image-level labels and corresponding images to create a high-quality visual prototype feature bank, guiding the gen- eration of more accurate CAMs as pseudo masks for WSS. As illustrated in Figure 2 , the PBIP framework consists of two main components: a Classification Network (ClassNet) and an Image Feature Matching Network (ImgMatchNet). The ClassNet takes a histopathology image X ∈ R H × W × C from the dataset and the prototype feature vec- tors \mathbf {P}_ i from ImgMatchNet (as detailed in Section 3.4 ), where H , W , and C denote the height, width, and num- ber of channels, respectively. ClassNet performs a classi- fication task to generate initial pseudo-segmentation masks M ∈ R H × W × N and is optimized by a classification loss L CLS , where N denotes the number of classes in the dataset. The ImgMatchNet receives the input histopathology im- age X , an image bank constructed from the training set through clustering, and the pseudo-segmentation masks \protect \mathbf  {M} generated by the ClassNet. ImgMatchNet extracts proto- type features \protect \mathbf  {P} using a CLIP image encoder from the im- age bank and refines the pseudo-segmentation masks \protect \mathbf  {M} through a similarity matching loss L SIM . The refined masks \protect \mathbf  {M} are merged via an argmax operation over the channel dimension to produce the final activation map for the first stage of WSS. These masks are subsequently used to train a fully supervised segmentation model in the second stage, generating the final segmentation masks.

The ClassNet generates the initial pseudo-segmentation masks \protect \mathbf  {M} by leveraging both the input image \mathbf {X} and the pro- totype features \mathbf {P} . We adopt SegFormer [ 49 ] as the back- bone due to its efficacy in capturing multi-scale contextual information through its hierarchical transformer encoder. Given an input histopathology image \mathbf {X} , hierarchical feature maps \ m a t hb f {F } _ i \ i n \ m a t hbb {R}^{(H/2^{i+1}) \times (W/2^{i+1}) \times C_i} are extracted across different stages i = 1 , 2, 3 , with C _{ i + 1} > C_i , where C i corresponds to the number of channels at each hierar- chical level i of the feature maps. To generate the ini- tial pseudo masks, the cosine similarity is computed ( SIM ) between each pixel feature vector in \mathbf {F}_i and the proto- type feature vectors in \ m a t h b f {P}_i \in \mathbb {R}^{N \times K \times C_i} . This computa- tion produces confidence scores for each pixel across all classes, forming the pseudo-segmentation masks \ m a t hb f {M } _ i \ i n \ m a thbb {R}^{(H/2^{i+1}) \times (W/2^{i+1}) \times N} . The confidence score for pixel p and class n at level i is calculated as:

{ M

( p , n ) = \f r a c { 1 } { K } \ su m _ {k=1}^{K} \frac { \mathbf {F}_i(p) \cdot \mathbf {P}_i(n, k) }{ \|\mathbf {F}_i(p) \|\ \mathbf {P}_i(n, k) \| }, (2)

\ ma t h b f

} _i

where \ m a thbf {F}_i(p) is the feature vector of pixel p in \mathbf {F}_i , and \ m at h bf {P}_i(n, k) is the k -th prototype feature vector for class n . By averaging the cosine similarities over all prototypes K for each class, it effectively captures intra-class variations and obtains a robust confidence score that reflects the likelihood of the pixel p belonging to the class n .

## 3.2. Construction of Image Bank

## 3.4. Image Feature Matching Network

ImgMatchNet introduces image prompts through a prototype-based approach. It generates prototype features \protect \mathbf  {P} from the image bank, and then ClassNet is used to

We construct an image bank that captures diverse visual prototypes for each class, which is automatically assembled from the training set. Specifically, we select tissue images

30273

# Page 4

Figure 2. Structure of the proposed PBIP framework. Overview. PBIP consists of two main components: a Classification Net- work(ClassNet) and an Image Feature Matching Network(ImgMatchNet), which leverage an external image bank to provide image prompts in the form of prototypes. Image Bank. Training images are grouped by their labels and clustered into K subclasses per class. For each subclass, N K representative images are selected to build the image bank. ClassNet. It receives an input image \protect \mathbf  {X} and prototype features \protect \mathbf  {P} , performing a classification task to generate the pseudo-segmentation mask \protect \mathbf  {M} . ImgMatchNet. It processes the input image \protect \mathbf  {X} and the initial pseudo-segmentation mask \protect \mathbf  {M} , extracting foreground and background regions. These regions are then matched with \protect \mathbf  {P} from the image bank to refine the pseudo mask generation.

where M ′ ∈ R H × W × N , and Up ( · ) denotes the upsampling operation to match the original image resolution. We employ an adaptive thresholding module to separate foreground and background regions. This module computes an adaptive threshold τ based on the intensity distribution of the pseudo-mask, dynamically distinguishing between foreground and background to reduce noise. The adaptive threshold is computed as:

compute pixel-level class confidences in the feature maps. To extract these prototype features, we employ the image encoder from the pre-trained MedCLIP model [ 47 ], a variant of the CLIP architecture tailored for medical images and trained on large-scale medical image-text pairs. All images in the image bank are encoded using the Med- CLIP image encoder, producing feature representations de- noted as \ m a t h b f { F }_p \in \mathbb {R}^{N \times K \times N_K \times d} , where N is the number of classes in the dataset, K is the number of subclasses per class determined by the clustering, N_K is the number of images per subclass, and d is the dimension of the fea- ture space. The mean feature vector is computed for each subclass across its images to obtain the prototype features, yielding \ m a t h b f {P} \in \mathbb {R}^{N \times K \times d} . To align these prototype features with the hierarchical feature maps generated by the Class- Net, we employ a Multi-Layer Perceptron (MLP) composed of fully connected layers and ReLU activations. The MLP projects the prototype features to match the dimensionality of each feature level, producing \ m a t h b f {P}_i \in \mathbb {R}^{N \times K \times C_i} . ImgMatchNet includes a foreground-background sepa- ration module to further refine the pseudo-masks obtained from the ClassNet. Specifically, this module upsamples and aggregates the hierarchical pseudo-masks from differ- ent feature levels to obtain a comprehensive pseudo-mask:

\ t au = \ d e l ta \c dot \max (\mathbf {M}), \quad \delta \in [0, 1], (4)

where δ is a scaling parameter that controls the threshold level. Applying this threshold to the activation map yields a binary mask b ∈ R H × W × N , where pixel values greater than or equal to τ are set to 1 (foreground), and values below τ are set to 0 (background). We then separate foreground and background images through element-wise multiplication:

\ m a t h b f { X} _ {\ t e x t { F G } } = b \cdot \mathbf {M} \cdot \mathbf {X}, \quad \mathbf {X}_{\text {BG}} = (1 - b) \cdot (1 - \mathbf {M}) \cdot \mathbf {X}, (5)

where X FG , X BG ∈ R H × W × N represent the separated fore- ground and background regions. By using the same Med- CLIP image encoder and MLP, we extract hierarchical fore- ground and background features F FG i , F BG i ∈ R N × C i . These features are then utilized in a similarity matching loss to optimize the generation of the pseudo-masks further.

## 3.5. Optimization Objectives

m a

Our model is jointly optimized by two objectives: the classi- fication loss L CLS , which ensures consistency between pre-

\

## t hb f { M ' } = \sum _{i=1}^{3} \text {Up}(\mathbf {M} _i), (3)

30274

![p4_img001](images/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p4-img001.png)

# Page 5

dicted labels and image-level annotations, and the similar- ity loss L SIM , which promotes alignment between the en- coded features of the foreground and background regions with their respective prototype features \protect \mathbf  {P} . The total loss function is defined as:

from foreground prototype features. Given the background image feature F BG [ j ] , the background prototype feature P BG = P [ j ] for the j -th region, and the foreground pro- totype features P FG = P [ m ] , the loss is defined as:

## {L} _ { \ te x t {

l

\mat h c a l {L } _ { \ tex t {total}} = \alpha \cdot \mathcal {L}_{\text {CLS}} + \beta \cdot \mathcal {L}_{\text {SIM}}, (6)

{ \exp \left ( {\bar {\mathbf {s}}_{\text {j}}^{\text {BB}}}/{\tau } \right )}{\exp \left ( {\bar {\mathbf {s}}_{\text {j,j}}^{\text {BF}}}/{\tau } \right ) + \exp \left ( {\bar {\mathbf {s}}_{\text {j}}^{\text {BB}}}/{\tau } \right )} \right ), (11)

\m a t hca

## BGS } } = -\l og \ lef t ( \ f ra c

where α and β are weighting coefficients that balance the contribution of each loss term. Classification Loss. Image-level class predictions ˆ y ∈ R 3 × N are obtained by applying global average pooling to the pseudo-segmentation masks \protect \mathbf  {M} from each hierarchical level in the ClassNet, where 3 corresponds to the levels and N is the number of classes. The predictions are compared with the ground-truth labels y ∈ R 1 × N , and the classifica- tion loss for each level i is:

\b a r {\m a t hb f { s } }_ { \text {j}}^{\text {BB}}=mean(F_{\text {BG}}[j] \cdot P_\text {BG}), (12)

where ¯ s BB j is the mean of similarity scores between the background feature of the j -th class and the background prototype. The total similarity loss is the combination of the two components:

\m a t h c a l { L } _ { \ tex t {SIM}} = \theta _1\cdot \mathcal {L}_{\text {FGS}} + \theta _2 \cdot \mathcal {L}_{\text {BGS}}. (13)

\m a t h c al {L}_{\te x t { C L S }}[i] = \textit {CossEntropy}(y, \hat {y}[i]) (7)

where \theta _ 1 and \theta _ 2 are weights that balance the importance of the foreground and background similarity terms.

where σ is the sigmoid function. The total classification loss is a weighted sum:

## 4. Experiments

t h

\m a

c al {L} _ { \ text {CLS}} = \sum _{i=1}^{3} \mathcal {L}_{\text {CLS}}[i]. (8)

## 4.1. Experimental Setup

Datasets. We evaluated our method on four histopatho- logical datasets. BCSS [ 2 ] consists of 151 H&E-stained breast cancer images from TCGA-BRCA, annotated with four classes (Tumor, Stroma, Lymphocytic infiltrate, Necro- sis), and includes 30,000 training patches, 2,500 validation patches and 2,500 testing patches. BCSS-WSSS [ 17 ] is derived from BCSS for WSS with 23,422 training patches, 3,418 validation patches and 4,986 testing patches. LUAD-HistoSeg [ 17 ] contains 17,291 H&E-stained lung adenocarcinoma patches, annotated with four classes (Tumor Epithelium, Stroma, Necrosis, and Lymphocytes), with 16,678 training patches, 306 validation patches and 307 testing patches. GCSS [ 39 ] comprises 100 H&E-stained Gastric cancer images from TCGA-STAD gastric cancer images, anno- tated with four classes (Tumor, Lymphoid Stroma, Desmo- plastic Stroma, Smooth Muscle Necrosis) providing 20,000 training, 2,500 validation patches and 2,500 testing patches. BCSS-WSSS and LUAD-HistoSeg are used exclusively for weakly supervised segmentation tasks, as the training images are labelled only at the image level, with the vali- dation and test sets still including ground truth masks for evaluation purposes. More details about datasets are in the Supplementary Material. Implementation Details. The ClassNet utilizes the Mix Transformer from SegFormer [ 49 ] as its backbone, which is pretrained on ImageNet-1K. The ImgMatchNet is built upon an image bank assembled from the training set, where

Similarity Loss. The similarity loss \ protect \mathcal  {L}_{\text {SIM}} is divided into two components: the foreground similarity loss \ protect \mathcal  {L}_{\text {FGS}} and the background similarity loss \ protect \mathcal  {L}_{\text {BGS}} . The foreground similarity loss L FGS aligns the fore- ground image features with the corresponding foreground prototype features, while distinguishing them from the background prototype features. Formally, given the fore- ground image feature F FG [ j ] for the j -th class, foreground prototype feature P FG = P [ j ] , and the background proto- type features P BG = P [ m ] where 1 ≤ m ≤ N and m ̸ = j , the loss is defined as:

## {L} _ { \t e xt

l

\

f rac {\exp \left ( {\mathbf {s}_{\text {j}}^{\text {FF}}}/{\tau } \right )}{\exp \left ( {\mathbf {s}_{\text {j}}^{\text {FF}}}/{\tau } \right ) + \exp \left ( {\mathbf {s}_{\text {j}}^{\text {FB}}}/{\tau } \right )} \right ), (9)

\m a t hca

## {FG S } } = - \ l og \ l ef t (

where

\ m a thb f {s } _ { \ t ex t { j} } ^ {\t e x t { F F } } =s u m(F_{\text {FG}}[j] \cdot P_\text {FG}), \mathbf {s}_{\text {j}}^{\text {FB}}=sum(F_{\text {FG}}[j] \cdot P_\text {BG}), (10)

where s FF j is the sum of similarity scores between the fore- ground feature and the foreground prototype of the j -th class, while s FB j is the sum of similarity scores between the foreground feature of the j -th class and the background pro- totype. The temperature parameter \tau controls the concen- tration level of the distribution. Similarly, \ protect \mathcal  {L}_{\text {BGS}} aligns background image features with background prototype features while distinguishing them

30275

# Page 6

### Table 1

[View CSV](tables/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p6-table_1.csv)

Table 1. Quantitative comparison of various methods on four histopathological datasets. The best results are highlighted in bold. “Sup.” denotes the type of supervision used: F & S represents fully and semi-supervised methods, while W indicates weakly supervised methods. Except for CLIMS and QA-CLIMS (designed for natural image segmentation), all methods are specifically tailored for histopathological image segmentation. For the BCSS-WSSS and LUAD-HistoSeg, the p -values from t-tests comparing our model with the second-best results ∗ were calculated, and all p -values were less than 0.05.

### Table 2

[View CSV](tables/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p6-table_2.csv)

Frequency Weighted IoU (FWIoU), Boundary IoU (bIoU), and Dice Coefficient. We also calculated p-values from t- tests to indicate the statistical significance of our results, measuring the probability that the observed differences oc- curred by chance.

Table 2. Ablation study of different loss function combinations on the initial pseudo masks quality (mIoU%) for the BCSS-WSSS dataset.

## 4.2. Results

the number of clusters K in K -Means was set to 3, and each subclass contains N_K =100. The scaling parameter δ in the adaptive thresholding module was 0.15. During training, we utilized the AdamW optimizer with an initial learning rate of 1 × 10 − 5 and a weight decay of 0.003. The total loss function combines the classification loss and similarity loss with weighting factors α = 1 and β = 0 . 5 , respectively. The temperature parameter in both \ protect \mathcal  {L}_{\text {FGS}} and \ protect \mathcal  {L}_{\text {BGS}} was set to 1, while θ 1 and θ 2 were set to 1 and 0.5, respectively. The model was trained for 10 epochs, with a batch size of 10 during the first stage. In the second stage in WSS, an unmodified Deeplab-v2 model [ 5 ] was trained as a fully supervised segmentation model. All mod- els were trained on a single 4090 GPU. To quantitatively evaluate our method, we employed four standard metrics: Mean Intersection over Union (mIoU),

(a) Analysis of β/α .

(b) Analysis of θ 2 /θ 1 .

Figure 3. Ablation study on hyperparameter ratios. The mIoU values are reported on initial pseudo masks for BCSS-WSSS.

We compared our model with ten advanced methods, including three supervised models and five weakly super- vised models, two state-of-the-art text-prompted weakly su- pervised models. We used the reported results for SSPCL and TransWS due to the unavailability of publicly available

30276

![p6_img001](images/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p6-img001.png)

![p6_img002](images/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p6-img002.png)

# Page 7

### Table 1

[View CSV](tables/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p7-table_1.csv)

### Table 2

[View CSV](tables/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p7-table_2.csv)

Table 4. Ablation study on the number of clusters K in k-means across different datasets. The mIoU values on initial pseudo masks for BCSS-WSSS are reported with standard deviation. The opti- mal K value varies per dataset, with K  = 2 to K  = 4 generally achieving the highest performance.

seeds for robustness. In Figure 4 , “Proto Num” represents the number of images per sub-bank per category. The re- sults show that the average mIoU improves as the number of prototype images increases. Using all eligible training images yielded a mIoU of 69.15%, suggesting that more im- ages help reduce noise in prototype computation. However, due to inter-class homogeneity, simply increasing the num- ber is not the most effective approach. The highest mIoU of 69.52% was achieved with 100 images per sub-bank. When clustering was applied to select 100 images, the mIoU fur- ther increased to 69.60%. This demonstrates that selecting representative images through clustering is more effective than merely increasing quantity, as clustering captures the most discriminative features and mitigates challenges posed by inter-class homogeneity. Additionally, we analyzed the impact of the number of clusters K in K -Means. As shown in Table 4 , the best re- sults across all datasets were obtained when K was set be- tween 2 and 4, indicating that the optimal choice of K may depend on the level of inter-class homogeneity and intra- class heterogeneity within the dataset. Specifically, a small K prevents the model from adequately capturing intra-class heterogeneity, and an excessively high K amplifies the in- fluence of inter-class homogeneity. Ablation study of the Loss Function. We analyzed the impact of different loss function configurations. Specif- ically, we varied the weighting ratios β/α (for L SIM and L CLS ) and θ 2 /θ 1 (for L BGS and L FGS ), as illustrated in Fig- ure 3 . The results indicate that extreme values of these ra- tios lead to a decline in performance. Furthermore, exclud- ing either L FGS or L BGS causes the mIoU to drop signifi- cantly from 67.54% to 50.23% and 55.01%, respectively. This substantial decrease suggests that both components are essential; relying solely on one causes the model to focus excessively on either the foreground or background, lead-

Table 3. Performance comparison of different combinations of image encoders (CLIP, MedCLIP, PLIP, DINOv2) and backbones (SegFormer, ResNet variants, TransUNet) on initial pseudo masks for BCSS-WSSS.

code. All other models were retrained and tested with five random seeds for robustness. Proto2Seg is a model based on human feedback; in our comparison with Proto2Seg, we carefully selected patches that met the required crite- ria using existing patch-level and image-level annotations instead of performing manual cutting and human feedback labelling. This might lead to a performance improvement for the Proto2Seg model. As shown in Table 1 , our PBIP framework generally out- performs state-of-the-art weakly supervised methods across the four datasets. Specifically, on BCSS-WSSS, LUAD- HistoSeg and GCSS, our method outperforms Proto2Seg by 1.68%, 1.53% and 1.87% in mIoU, achieving the best weakly supervised performance. All p -values between our model and the second best on BCSS-WSSS and LUAD- HistoSeg are below 0.05, confirming the statistical signif- icance of our improvements. Figure 5 shows the pseudo masks generated during the first stage of WSS models. We compared PBIP with MLPS, TPRO, and CLIMS. MLPS ranks third on BCSS- WSSS, while TPRO achieves the third-best on LUAD based. CLIMS is a text-supervised segmentation model for natural images. The results indicate that PBIP activates more complete object content and fewer background re- gions, while TPRO offers slight improvement over MLPS and CLIMS shows many errors. Text features do not en- hance histopathological segmentation, and text supervision can mislead the model due to inter-class homogeneity and intra-class heterogeneity in histopathological images.

## 4.3. Ablation Studies

Ablation study of Image Bank. We investigated the im- pact of the number of prototype images by randomly select- ing images without clustering, using 10 different random

### Table 3

[View CSV](tables/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p7-table_3.csv)

Table 5. Ablation study on the impact of SIM and Adaptive Thresholding (AT) on initial pseudo masks for BCSS-WSSS.

30277

# Page 8

### Table 1

[View CSV](tables/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p8-table_1.csv)

Table 6. Zero-shot classification F1 scores (%) on the BCSS- WSSS dataset using CLIP, PLIP, and MedCLIP with text and im- age prompts.

Figure 5. a. Visualization of the pseudo-segmentation masks gen- erated by models in the first stage on BCSS-WSSS. The masks are overlaid on the input images, with the raw pseudo-segmentation mask shown in the top-left corner. b. The foreground images gen- erated by PBIP for the four segmentation targets. More visualiza- tions are in Supplementary Material.

histopathology, as these more generic encoders appear less effective for the specialized task of tissue segmentation. Text prompt and Image prompt. To explore the chal- lenges of image-text matching in histopathology, we con- ducted zero-shot classification experiments on the BCSS- WSSS dataset using CLIP, PLIP, and MedCLIP with both text and image prompts (see Table 6 ). For text prompts, we used the common format: “a photo of { class name } ” , while for image prompts, we utilized our prototype image features. The results show that PLIP and MedCLIP signifi- cantly outperform CLIP when using image prompts, but all models perform poorly with text prompts. This highlights the substantial challenges of text prompting in histopathol- ogy, where textual descriptions struggle to capture complex visual patterns and inter-class homogeneity. In contrast, image prompts effectively guide the models by aligning with the intricate characteristics of histopathological images through prototype features.

Figure 4. Ablation study of the number of prototype images. Proto Num represents the number of prototype images per sub-bank for each category. We report the mIoU values with Standard Deviation obtained over 10 runs with different random seeds.

ing to incomplete or erroneous activations. Ablation study of the Modules. We analyzed the ef- fectiveness of different modules within PBLP. As shown in Table 5 , both the SIM and the Adaptive Thresholding Module significantly enhance model performance. Specif- ically, when the SIM module is removed, we substitute it with a simple 1 × 1 convolutional layer to generate the pseudo-segmentation masks. The results demonstrate a no- ticeable decline in performance without the SIM and AT module. The SIM module captures intra-class heterogene- ity and inter-class homogeneity better than the 1 \times 1 con- volutional layer. Furthermore, Figure 1 illustrates the fore- ground images generated by the model with and without the AT module. The results demonstrate that AT effectively re- duces noise in background regions. Additionally, we evaluated the performance of our model using different image encoders and backbones, as summa- rized in Table 3 . The combination of MedCLIP [ 47 ] and SegFormer achieved the best results in terms of mIoU met- ric. We observed that the PLIP [ 19 ] and SegFormer pairing performed best on the bIoU, FWIoU, and Dice coefficient. The TransUNet model [ 4 ], with its end-to-end architecture that does not utilize the SIM module for pseudo-mask com- putation, exhibited inferior performance. These results sug- gest that the absence of the SIM module may contribute to the lower effectiveness. Moreover, the relatively poor per- formance of CLIP [ 36 ] and DINOv2 [ 31 ] further highlights the importance of external knowledge from pretraining in

## 5. Conclusion

We proposed a novel Prototype-Based Image Prompt- ing (PBIP) framework to address the challenges of inter-class homogeneity and intra-class heterogeneity in weakly supervised histopathological image segmentation. PBIP leverages image-based labels and correspond- ing images in histopathology datasets by extracting class prototype features through clustering methods. By incorporating class prototypes, our approach effec- tively mitigates inter-class homogeneity, while multiple sub-prototypes for each class address intra-class hetero- geneity. Validation on four datasets demonstrated that PBIP achieves state-of-the-art performance and robust- ness in weakly supervised histopathological segmentation.

30278

![p8_img001](images/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p8-img001.png)

![p8_img002](images/Tang_Prototype-Based_Image_Prompting_for_Weakly_Supervised_Histopathological_Image_Segmentation_CVPR_2025_paper-p8-img002.png)

# Page 9

## References

[16] Ruoyu Guo, Kunzi Xie, Maurice Pagnucco, and Yang Song. Sac-net: Learning with weak and noisy labels in histopathol- ogy image segmentation. Medical Image Analysis , 86: 102790, 2023. 2 [17] Chu Han, Jiatai Lin, Jinhai Mai, et al. Multi-layer pseudo- supervision for histopathology tissue semantic segmentation using patch-level classification labels. Medical Image Anal- ysis , 80:102487, 2022. 1 , 2 , 5 , 6 [18] Mingcheng Hou and Issei Sato. A closer look at prototype classifier for few-shot image classification. NeurIPS , 35: 25767–25778, 2022. 3 [19] Zhi Huang, Federico Bianchi, Mert Yuksekgonul, Thomas J Montine, and James Zou. A visual–language foundation model for pathology image analysis using medical twitter. Nature medicine , 29(9):2307–2316, 2023. 7 , 8 [20] Hoel Kervadec, Jose Dolz, Meng Tang, Eric Granger, Yuri Boykov, and Ismail Ben Ayed. Constrained-cnn losses for weakly supervised segmentation. Medical image analysis , 54:88–99, 2019. 1 [21] Hoel Kervadec, Jose Dolz, Shanshan Wang, Eric Granger, and Ismail Ben Ayed. Bounding boxes for weakly super- vised segmentation: Global constraints get close to full su- pervision. In Medical imaging with deep learning , pages 365–381. PMLR, 2020. 1 [22] Jungbeom Lee, Eunji Kim, and Sungroh Yoon. Anti- adversarially manipulated attributions for weakly and semi- supervised semantic segmentation. In CVPR , pages 4071– 4080, 2021. 2 [23] Jungbeom Lee, Seong Joon Oh, Sangdoo Yun, Junsuk Choe, Eunji Kim, and Sungroh Yoon. Weakly supervised semantic segmentation using out-of-distribution data. In CVPR , pages 16897–16906, 2022. 1 [24] Seungho Lee, Minhyun Lee, Jongwuk Lee, and Hyunjung Shim. Railroad is not a train: Saliency as pseudo-pixel su- pervision for weakly supervised semantic segmentation. In CVPR , pages 5495–5505, 2021. 1 , 2 [25] Chao Li, Xinggang Wang, Wenyu Liu, Longin Jan Latecki, Bo Wang, and Junzhou Huang. Weakly supervised mitosis detection in breast histopathology images using concentric loss. Medical image analysis , 53:165–178, 2019. 2 [26] Yi Li, Yiduo Yu, Yiwen Zou, Tianqi Xiang, and Xiaomeng Li. Online easy example mining for weakly-supervised gland segmentation from histology images. In MICCAI , pages 578–587. Springer, 2022. 2 , 6 [27] Pengfei Liu, Weizhe Yuan, Jinlan Fu, et al. Pre-train, prompt, and predict: A systematic survey of prompting methods in natural language processing. ACM Computing Surveys , 55 (9):1–35, 2023. 2 [28] Xiangbin Liu, Liping Song, Shuai Liu, and Yudong Zhang. A review of deep-learning-based medical image segmentation methods. Sustainability , 13(3):1224, 2021. 1 [29] Xiaoming Liu, Quan Yuan, Yaozong Gao, et al. Weakly supervised segmentation of covid19 infection with scribble annotation on ct images. Pattern recognition , 122:108341, 2022. 1 [30] Shervin Minaee, Yuri Boykov, Fatih Porikli, Antonio Plaza, Nasser Kehtarnavaz, and Demetri Terzopoulos. Image seg-

[1] Jiwoon Ahn, Sunghyun Cho, and Suha Kwak. Weakly su- pervised learning of instance segmentation with inter-pixel relations. In CVPR , pages 2209–2218, 2019. 1 , 2 [2] Mohamed Amgad, Habiba Elfandy, Hagar Hussein, et al. Structured crowdsourcing enables convolutional segmenta- tion of histology images. Bioinformatics , 35(18):3461–3467, 2019. 2 , 5 , 6 [3] Lyndon Chan, Mahdi S Hosseini, Corwyn Rowsell, et al. Histosegnet: Semantic segmentation of histological tissue type in whole slide images. In ICCV , pages 10662–10671, 2019. 2 , 6 [4] Jieneng Chen, Yongyi Lu, Qihang Yu, et al. Transunet: Transformers make strong encoders for medical image seg- mentation. arXiv:2102.04306 , 2021. 8 [5] Liang-Chieh Chen, George Papandreou, Iasonas Kokkinos, Kevin Murphy, and Alan L Yuille. Deeplab: Semantic image segmentation with deep convolutional nets, atrous convolu- tion, and fully connected crfs. TPAMI , 40(4):834–848, 2017. 6 [6] Zhe Chen, Zhao Chen, Jingxin Liu, et al. Weakly supervised histopathology image segmentation with sparse point anno- tations. JBHI , 25(5):1673–1685, 2020. 2 [7] Zhaozheng Chen, Tan Wang, Xiongwei Wu, Xian-Sheng Hua, Hanwang Zhang, and Qianru Sun. Class re-activation maps for weakly-supervised semantic segmentation. In CVPR , pages 969–978, 2022. 2 [8] Jia Deng, Wei Dong, Richard Socher, Li-Jia Li, Kai Li, and Li Fei-Fei. Imagenet: A large-scale hierarchical image database. In CVPR , pages 248–255. Ieee, 2009. 1 [9] Songhe Deng, Wei Zhuo, Jinheng Xie, and Linlin Shen. Question-answer cross language image matching for weakly supervised semantic segmentation. arXiv:2401.09883 , 2024. 1 , 2 , 3 , 6 [10] Ning Ding, Shengding Hu, Weilin Zhao, et al. Open- prompt: An open-source framework for prompt-learning. arXiv:2111.01998 , 2021. 2 [11] Amelie Echle, Niklas Timon Rindtorff, Titus Josef Brinker, et al. Deep learning in cancer pathology: a new generation of clinical biomarkers. British journal of cancer , 124(4):686– 696, 2021. 1 [12] Lei Fan, Arcot Sowmya, Erik Meijering, and Yang Song. Learning visual features by colorization for slide-consistent survival prediction from whole slide images. In MICCAI , pages 592–601. Springer, 2021. [13] Lei Fan, Arcot Sowmya, Erik Meijering, and Yang Song. Cancer survival prediction from whole slide images with self-supervised learning and slide consistency. TMI , 42(5): 1401–1412, 2022. [14] Lei Fan, Arcot Sowmya, Erik Meijering, and Yang Song. Fast ff-to-ffpe whole slide image translation via laplacian pyramid and contrastive learning. In MICCAI , pages 409– 419. Springer, 2022. 1 [15] Lei Fan, Dongdong Fan, Yiwen Ding, Yong Wu, Donglin Di, Maurice Pagnucco, and Yang Song. Grainbrain: Multi- view identification and stratification of defective grain ker- nels. IEEE Transactions on Industrial Informatics , 2025. 1

30279

# Page 10

mentation using deep learning: A survey. TPAMI , 44(7): 3523–3542, 2021. 1 [31] Maxime Oquab, Timoth´ee Darcet, Th´eo Moutakanni, et al. Dinov2: Learning robust visual features without supervision, 2024. 7 , 8 [32] Wentao Pan, Jiangpeng Yan, Hanbo Chen, et al. Human- machine interactive tissue prototype learning for label- efficient histopathology image segmentation. In IPMI , pages 679–691. Springer, 2023. 6 [33] Ziniu Qian, Kailu Li, Maode Lai, et al. Transformer based multiple instance learning for weakly supervised histopathology image segmentation. In MICCAI , pages 160– 170. Springer, 2022. 1 , 2 [34] Hui Qu, Pengxiang Wu, Qiaoying Huang, et al. Weakly su- pervised deep nuclei segmentation using partial points an- notation in histopathology images. TMI , 39(11):3655–3666, 2020. 1 [35] Mingcheng Qu, Yuncong Wu, Donglin Di, et al. Boundary- guided learning for gene expression prediction in spatial transcriptomics. In BIBM , pages 445–450. IEEE, 2024. 1 [36] Alec Radford, Jong Wook Kim, Chris Hallacy, et al. Learn- ing transferable visual models from natural language super- vision. In IMCL , pages 8748–8763. PMLR, 2021. 2 , 7 , 8 [37] Ramprasaath R Selvaraju, Michael Cogswell, Abhishek Das, et al. Grad-cam: Visual explanations from deep networks via gradient-based localization. In ICCV , pages 618–626, 2017. 2 [38] Yue Shen, Wanshu Fan, Cong Wang, et al. Dual-guided pro- totype alignment network for few-shot medical image seg- mentation. IEEE Transactions on Instrumentation and Mea- surement , 2024. 3 [39] Jiangbo Shi, Tieliang Gong, Chunbao Wang, and Chen Li. Semi-supervised pixel contrastive learning framework for tissue segmentation in histopathological image. JBHI , 27 (1):97–108, 2022. 2 , 5 , 6 [40] Zhenhong Sun, Junyan Wang, Zhiyu Tan, et al. Eggen: Im- age generation with multi-entity prior learning through entity guidance. In ACM MM , pages 6637–6645, 2024. 2 [41] Nima Tajbakhsh, Laura Jeyaseelan, Qian Li, et al. Embrac- ing imperfect datasets: A review of deep learning solutions for medical image segmentation. Medical image analysis , 63:101693, 2020. 1 [42] A Vaswani. Attention is all you need. NeurIPS , 2017. 2 [43] Haofan Wang, Zifan Wang, Mengnan Du, et al. Score-cam: Score-weighted visual explanations for convolutional neural networks. In CVPR workshops , pages 24–25, 2020. 2 [44] Junyan Wang, Zhenhong Sun, Zhiyu Tan, et al. Towards ef- fective usage of human-centric priors in diffusion models for text-based human image generation. In CVPR , pages 8446– 8455, 2024. 2 [45] Kaixin Wang, Jun Hao Liew, Yingtian Zou, Daquan Zhou, and Jiashi Feng. Panet: Few-shot image semantic segmenta- tion with prototype alignment. In ICCV , pages 9197–9206, 2019. 3 [46] Yude Wang, Jie Zhang, Meina Kan, Shiguang Shan, and Xilin Chen. Self-supervised equivariant attention mech- anism for weakly supervised semantic segmentation. In CVPR , pages 12275–12284, 2020. 2

[47] Zifeng Wang, Zhenbang Wu, Dinesh Agarwal, and Jimeng Sun. Medclip: Contrastive learning from unpaired medical images and text. arXiv:2210.10163 , 2022. 1 , 4 , 7 , 8 [48] Aming Wu, Yahong Han, Linchao Zhu, and Yi Yang. Universal-prototype enhancing for few-shot object detection. In ICCV , pages 9567–9576, 2021. 3 [49] Enze Xie, Wenhai Wang, Zhiding Yu, Anima Anandkumar, Jose M Alvarez, and Ping Luo. Segformer: Simple and ef- ficient design for semantic segmentation with transformers. NeurIPS , 34:12077–12090, 2021. 3 , 5 [50] Jinheng Xie, Xianxu Hou, Kai Ye, and Linlin Shen. Clims: Cross language image matching for weakly supervised se- mantic segmentation. In CVPR , pages 4483–4492, 2022. 1 , 2 , 3 , 6 [51] Hanwen Xu, Naoto Usuyama, Jaspreet Bagga, Sheng Zhang, et al. A whole-slide foundation model for digital pathology from real-world data. Nature , pages 1–8, 2024. 1 [52] Xiaobo Yang and Xiaojin Gong. Foundation model assisted weakly supervised semantic segmentation. In CACV , pages 523–532, 2024. 3 [53] Hongrun Zhang, Liam Burrows, Yanda Meng, et al. Weakly supervised segmentation with point annotations for histopathology images via contrast-based variational model. In CVPR , pages 15630–15640, 2023. 2 [54] Jingwei Zhang, Ke Ma, Saarthak Kapse, et al. Sam-path: A segment anything model for semantic segmentation in digital pathology. In MICCAI , pages 161–170. Springer, 2023. 6 [55] Mingya Zhang, Liang Wang, Limei Gu, et al. Sam2-path: A better segment anything model for semantic segmentation in digital pathology. arXiv:2408.03651 , 2024. 6 [56] Shaoteng Zhang, Jianpeng Zhang, and Yong Xia. Transws: Transformer-based weakly supervised histology image seg- mentation. In MLMI , pages 367–376. Springer, 2022. 1 , 6 [57] Shaoteng Zhang, Jianpeng Zhang, Yutong Xie, and Yong Xia. Tpro: Text-prompting-based weakly supervised histopathology tissue segmentation. In MICCAI , pages 109– 118. Springer, 2023. 1 , 2 , 6 [58] Yibo Zhang, Zijian Yang, Ruanqi Chen, et al. Histopathol- ogy images-based deep learning prediction of prognosis and therapeutic response in small cell lung cancer. NPJ digital medicine , 7(1):15, 2024. 1 [59] Bolei Zhou, Aditya Khosla, Agata Lapedriza, Aude Oliva, and Antonio Torralba. Learning deep features for discrimi- native localization. In CVPR , pages 2921–2929, 2016. 1 [60] Kaiyang Zhou, Jingkang Yang, Chen Change Loy, and Zi- wei Liu. Conditional prompt learning for vision-language models. In CVPR , pages 16816–16825, 2022. 2 , 3 [61] Kaiyang Zhou, Jingkang Yang, Chen Change Loy, and Ziwei Liu. Learning to prompt for vision-language models. IJCV , 130(9):2337–2348, 2022. 2 [62] Zhi-Hua Zhou. A brief introduction to weakly supervised learning. National science review , 5(1):44–53, 2018. 1

30280